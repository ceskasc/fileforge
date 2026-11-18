import { createCanvas } from './canvas-surface.mjs';
import { ForgeError, LIMITS, outputType, targetDimensions } from './engine.mjs';
import { decode, encode } from './process.mjs';

const MAX_UPLOAD = 4_000_000;
const TIMEOUT = 230_000;
const knownErrors = new Set([
  'CLOUD_FILE_SIZE', 'CLOUD_BUSY', 'CLOUD_UNAVAILABLE', 'INVALID_FILE',
  'UNSUPPORTED', 'ANIMATED', 'INPUT_PIXELS', 'OUTPUT_PIXELS', 'OUTPUT_MEMORY'
]);

async function prepareUpload(file, type, signal, onProgress) {
  if (file.size <= MAX_UPLOAD) return { body: file, type };
  onProgress({ stage: 'cloudPrepare', value: 0.03 });

  let image, canvas;
  try {
    image = await decode(file);
    signal.throwIfAborted();
    canvas = createCanvas(image.width || image.naturalWidth, image.height || image.naturalHeight);
    const context = canvas.getContext('2d');
    if (!context) throw new ForgeError('CANVAS');
    context.drawImage(image, 0, 0);
    image.close?.();
    image = null;

    const uploadType = type === 'image/jpeg' ? type : 'image/webp';
    for (const quality of [0.96, 0.84, 0.72]) {
      signal.throwIfAborted();
      const body = await encode(canvas, uploadType, quality);
      if (body.size <= MAX_UPLOAD) return { body, type: uploadType };
    }
  } finally {
    image?.close?.();
    if (canvas) canvas.width = canvas.height = 1;
  }
  throw new ForgeError('CLOUD_FILE_SIZE');
}

function apiError(code) {
  return new ForgeError(knownErrors.has(code) ? code : 'CLOUD_UNAVAILABLE');
}

async function readResult(response, type, settings, onProgress) {
  if (!response.ok) {
    const report = await response.json().catch(() => ({}));
    throw apiError(response.status === 429 ? 'CLOUD_BUSY' : report.detail);
  }
  if (!response.body || !response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
    throw apiError();
  }

  const chunks = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', bytes = 0, result;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (buffer + decoder.decode(value, { stream: true })).split('\n');
      buffer = lines.pop();
      if (buffer.length > 67_000) throw apiError();
      for (const line of lines) {
        if (!line) continue;
        if (line.length > 67_000) throw apiError();
        const record = JSON.parse(line);
        if (record.error) throw apiError(record.error);
        if (record.chunk) {
          const chunk = Uint8Array.fromBase64?.(record.chunk)
            ?? Uint8Array.from(atob(record.chunk), character => character.charCodeAt(0));
          bytes += chunk.byteLength;
          if (bytes > LIMITS.outputBytes) throw apiError('OUTPUT_MEMORY');
          chunks.push(chunk);
        } else if (record.result) {
          result = record.result;
        } else if (['cloudModel', 'cloudAi', 'encode'].includes(record.stage) && Number.isFinite(record.value)) {
          onProgress({ stage: record.stage, value: Math.max(0.1, Math.min(0.95, record.value)) });
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (buffer || !result || !bytes || result.bytes !== bytes || result.type !== type) throw apiError();
  const target = targetDimensions(result.sourceWidth, result.sourceHeight, settings);
  if (result.width !== target.width || result.height !== target.height) throw apiError();
  const { width, height, sourceWidth, sourceHeight } = result;
  return { blob: new Blob(chunks, { type }), type, width, height, sourceWidth, sourceHeight };
}

export async function enhanceInCloud(file, meta, settings, { origin, signal, onProgress = () => {} }) {
  const request = new AbortController();
  const abort = () => request.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => request.abort(new ForgeError('CLOUD_TIMEOUT')), TIMEOUT);

  try {
    request.signal.throwIfAborted();
    const { body, type: uploadType } = await prepareUpload(file, meta.type, request.signal, onProgress);
    const type = outputType(settings.format, meta.type);
    const url = new URL('/api/enhance', origin);
    url.search = new URLSearchParams({
      scale: settings.scale, strength: settings.sharpness, denoise: settings.denoise,
      contrast: settings.contrast, output: type.slice(6), quality: settings.quality,
      background: settings.background
    });
    onProgress({ stage: 'cloudUpload', value: 0.08 });
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': uploadType }, body, signal: request.signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'
    });
    const result = await readResult(response, type, settings, onProgress);
    onProgress({ stage: 'complete', value: 1 });
    return result;
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    if (error instanceof ForgeError) throw error;
    throw apiError();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
