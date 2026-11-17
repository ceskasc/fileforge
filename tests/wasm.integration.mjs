import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {AI_MODELS,registerModelLayers,createModelRunner} from '../src/ai-runtime.mjs';

// The actual browser UMD + native WASM, with JS string evaluation forbidden.
// No npm-installed TF or mocked convolution is used.
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder,performance,URL,
  ArrayBuffer,Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,
  navigator:{userAgent:'FileForge WASM SIMD regression'},location:{href:'https://fileforge.example/'},
  document:{createElement:()=>({style:{},getContext:()=>null})},
  fetch:async url=>{
    const path=new URL(String(url)).pathname;
    if(!/^\/vendor\/tfjs-backend-wasm(?:-simd|-threaded-simd)?\.wasm$/.test(path))throw Error('Unexpected asset request: '+path);
    return new Response(readFileSync('.ai-cache'+path),{headers:{'Content-Type':'application/wasm'}});
  }
};
sandbox.self=sandbox;sandbox.window=sandbox;
const context=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:true}});
for(const name of ['tf.min.js','tf-backend-wasm.min.js'])vm.runInContext(readFileSync('.ai-cache/vendor/'+name,'utf8'),context,{timeout:15000});
const tf=context.tf;registerModelLayers(tf);tf.wasm.setThreadsCount(1);
tf.wasm.setWasmPaths('https://fileforge.example/vendor/');
const results=[];
async function loadModel(method){
  const dir='.ai-cache/models/'+AI_MODELS[method].path.replace(/model\.json$/,''),json=JSON.parse(readFileSync(dir+'model.json','utf8'));
  const body=Buffer.concat(json.weightsManifest.flatMap(g=>g.paths.map(p=>readFileSync(dir+p))));
  // TF's legacy serializer uses instanceof Array: deserialize inside its own realm.
  context.modelJSON=JSON.stringify(json);context.weightBytes=body;
  return vm.runInContext(`(async()=>{
    const json=JSON.parse(modelJSON),bytes=Uint8Array.from(weightBytes);
    return tf.loadLayersModel(tf.io.fromMemory({modelTopology:json.modelTopology,weightSpecs:json.weightsManifest.flatMap(g=>g.weights),weightData:bytes.buffer}));
  })()`,context,{timeout:15000});
}

for(const method of ['fast','photo','ultra'])test('real '+method+' model runs on WASM under strict JS CSP and matches CPU output',async()=>{
  await tf.setBackend('wasm');await tf.ready();assert.equal(tf.getBackend(),'wasm');
  let model=await loadModel(method);
  const rgb=Float32Array.from({length:16*16*3},(_,i)=>48+(i*17)%160);
  const before=tf.memory().numTensors,runner=createModelRunner(tf,model,AI_MODELS[method]);
  const warm=await runner.predict(rgb,16,16);assert.equal(warm.length,16*16*3*(AI_MODELS[method].nativeScale||2)**2);
  const start=performance.now(),output=await runner.predict(rgb,16,16),wasmMs=performance.now()-start;
  assert.equal(tf.memory().numTensors,before);model.dispose();
  await tf.setBackend('cpu');await tf.ready();model=await loadModel(method);
  const cpuStart=performance.now(),cpu=await createModelRunner(tf,model,AI_MODELS[method]).predict(rgb,16,16),cpuMs=performance.now()-cpuStart;
  model.dispose();
  let error=0,mean=0;
  for(let i=0;i<output.length;i++){error+=Math.abs(output[i]-cpu[i]);mean+=output[i];}
  error/=output.length;mean/=output.length;
  assert.ok(error<1,'Accelerated output must preserve model accuracy; mean error '+error);
  assert.ok(mean>25&&mean<235,'Output must not collapse to black or white');
  assert.equal(tf.memory().numTensors,0);
  results.push({method,wasmMs,cpuMs,speedup:cpuMs/wasmMs,meanAbsoluteErrorVsCpu:error,meanRGB:mean});
});
test('restoration conversion preserves original RGB order, PReLU and 4x nearest residual',async()=>{
  await tf.setBackend('wasm');await tf.ready();
  const fixture=JSON.parse(readFileSync('tests/restoration-reference.json','utf8'));
  const bytes=Buffer.from(fixture.inputRgb,'base64'),values=Float32Array.from(bytes,n=>n/255),raw=Buffer.from(fixture.outputFloat32LE,'base64');
  const expected=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const model=await loadModel('photo');
  let output;
  try{
    output=tf.tidy(()=>model.predict(tf.tensor4d(values,[1,4,4,3])));
    const actual=await output.data();assert.equal(actual.length,expected.length);
    let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-expected[i]));
    assert.ok(maxError<.0001,'Must match independent original-layout reference; max error '+maxError);
  }finally{output?.dispose();model.dispose();}
  assert.equal(tf.memory().numTensors,0);
});
test.after(()=>{
  writeFileSync('ai-speed-validation.json',JSON.stringify({input:[16,16],simd:tf.env().get('WASM_HAS_SIMD_SUPPORT'),javascriptStringEvaluation:false,realTrainedWeights:true,results},null,2));
  console.log('AI_ACCELERATION '+JSON.stringify(results));
});
