import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { isTensorflowRuntime } from '../src/ai-runtime.mjs';

function browserContext() {
  const sandbox = {
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, performance,
    URL, URLSearchParams, fetch, Request, Response, Headers, AbortController,
    navigator: { userAgent: 'FileForge strict-CSP browser regression', maxTouchPoints: 0 },
    location: { href: 'https://fileforge.example/' },
    document: { createElement: () => ({ style: {}, getContext: () => null }) },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
}

test('reproduces the original browser bootstrap error and rejects its partial TensorFlow global', () => {
  const context = browserContext();
  const upstream = readFileSync('.ai-cache/package/dist/tf.min.js', 'utf8');
  assert.throws(() => vm.runInContext(upstream, context, { timeout: 15000 }), error => error.name === 'EvalError');
  assert.equal(isTensorflowRuntime(context.tf), false);
});

test('the published runtime boots and runs real TensorFlow operations with string evaluation forbidden', async () => {
  const context = browserContext();
  vm.runInContext(readFileSync('.ai-cache/vendor/tf.min.js', 'utf8'), context, { timeout: 15000 });
  assert.equal(isTensorflowRuntime(context.tf), true);
  const result = await vm.runInContext(`(async () => {
    await tf.setBackend('cpu');
    await tf.ready();
    const count = tf.memory().numTensors;
    const value = tf.tidy(() => tf.tensor1d([1, 2, 3]).sum());
    const total = (await value.data())[0];
    value.dispose();
    return JSON.stringify({ backend: tf.getBackend(), total, leaked: tf.memory().numTensors - count });
  })()`, context, { timeout: 15000 });
  assert.deepEqual(JSON.parse(result), { backend: 'cpu', total: 6, leaked: 0 });
});

test('the page keeps string evaluation and external scripts disallowed', () => {
  const html = readFileSync('index.html', 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval';/);
  assert.ok(!csp.includes("'unsafe-eval'"));
});
