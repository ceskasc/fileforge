import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudIsHealthy } from '../src/cloud-health.mjs';

test('only a healthy FileForge service enables the server mode', async () => {
 const origin = 'https://api.example.test';
 const calls = [];
 const fetchImpl = async (url, options) => {
  calls.push([url.href, options]);
  return Response.json({ service: 'fileforge', protocol: 1, model: 'Real-ESRGAN x2plus' });
 };
 assert.equal(await cloudIsHealthy(origin, { fetchImpl }), true);
 assert.equal(calls[0][0], origin + '/api/health');
 assert.equal(calls[0][1].credentials, 'omit');
 assert.equal(calls[0][1].cache, 'no-store');
});

test('an unreachable, non-200, or unrelated endpoint never enables cloud restoration', async () => {
 const base = 'https://api.example.test';
 assert.equal(await cloudIsHealthy(base, { fetchImpl: async () => { throw Error('offline'); } }), false);
 assert.equal(await cloudIsHealthy(base, { fetchImpl: async () => new Response('', { status: 404 }) }), false);
 assert.equal(await cloudIsHealthy(base, { fetchImpl: async () => Response.json({ service: 'other', protocol: 1 }) }), false);
 assert.equal(await cloudIsHealthy('', { fetchImpl: async () => { throw Error('should not fetch'); } }), false);
});

test('a stalled health check times out without blocking the page', async () => {
 const fetchImpl = (_, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
 });
 assert.equal(await cloudIsHealthy('https://api.example.test', { fetchImpl, timeoutMs: 5 }), false);
});
