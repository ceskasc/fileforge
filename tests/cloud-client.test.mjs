import assert from 'node:assert/strict';
import test from 'node:test';
import { enhanceInCloud } from '../src/cloud-client.mjs';

const input = new Blob(['source'], { type: 'image/png' });
const meta = { width: 7, height: 5, type: input.type };
const settings = { mode: 'enhance', format: 'png', scale: 2, sharpness: 90, denoise: 0,
  contrast: false, quality: 100, background: '#ffffff' };
const origin = 'https://api.example.test';

test('cloud streams progress and returns an ordinary downloadable image result', async (t) => {
  const requests = [];
  const records = [
    { stage: 'cloudModel', value: 0.13 },
    { stage: 'cloudAi', value: 0.55 },
    { chunk: btoa('pixels') },
    { result: { width: 14, height: 10, sourceWidth: 7, sourceHeight: 5, type: 'image/png', bytes: 6 } }
  ].map(record => JSON.stringify(record)).join('\n') + '\n';
  const encoder = new TextEncoder();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options]);
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(records.slice(0, 51)));
      controller.enqueue(encoder.encode(records.slice(51)));
      controller.close();
    } });
    return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
  });

  const stages = [];
  const result = await enhanceInCloud(input, meta, settings, {
    origin, signal: new AbortController().signal, onProgress: event => stages.push(event.stage)
  });
  assert.deepEqual(stages, ['cloudUpload', 'cloudModel', 'cloudAi', 'complete']);
  assert.equal(await result.blob.text(), 'pixels');
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual([result.width, result.height], [14, 10]);
  const [[url, options]] = requests;
  assert.equal(url.origin, origin);
  assert.equal(url.searchParams.get('scale'), '2');
  assert.equal(options.body, input);
  assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit');
});

test('a stopped or busy cloud job never returns a partial image', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  const controller = new AbortController();
  await assert.rejects(enhanceInCloud(input, meta, settings, { origin, signal: controller.signal }),
    { code: 'CLOUD_BUSY' });
  controller.abort();
  await assert.rejects(enhanceInCloud(input, meta, settings, { origin, signal: controller.signal }),
    { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);

  fetch.mock.mockImplementation(async () => new Response('{"chunk":"cGl4ZWxz"}\n', {
    headers: { 'Content-Type': 'application/x-ndjson' }
  }));
  await assert.rejects(enhanceInCloud(input, meta, settings, { origin, signal: new AbortController().signal }),
    { code: 'CLOUD_UNAVAILABLE' });
});
