import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBackend} from '../src/ai-runtime.mjs';
import {createImageProcessor} from '../src/image-client.mjs';

test('fast AI uses the accelerator and Photo falls back from unavailable WebGL to WASM before JS CPU',async()=>{
  for(const method of ['fast','photo','ultra']){
    const calls=[];
    const tf={async setBackend(name){calls.push(name);return name!=='webgl';},async ready(){}};
    const backend=await selectBackend(tf,method,{loadAccelerator:async()=>calls.push('load-wasm')});
    assert.equal(backend,'wasm');
    assert.deepEqual(calls,['webgl','load-wasm','wasm']);
  }
});

test('an unavailable accelerator still permits real inference using an available backend',async()=>{
  const calls=[];
  const tf={async setBackend(name){calls.push(name);return name==='cpu';},async ready(){}};
  assert.equal(await selectBackend(tf,'fast',{loadAccelerator:async()=>{throw Error('WASM unavailable');}}),'cpu');
  assert.deepEqual(calls,['webgl','cpu']);
});

test('consecutive AI files reuse one worker and forward progress',async()=>{
  let created=0,terminated=0,fallback=0;
  const progress=[];
  const processor=createImageProcessor({canUseWorker:()=>true,workerFactory:()=>{
    created++;
    return{terminate(){terminated++;},postMessage({settings}){queueMicrotask(()=>{
      this.onmessage({data:{kind:'progress',stage:'ai',value:.6,backend:'wasm'}});
      this.onmessage({data:{kind:'done',result:settings.enhancementMethod}});
    });}};
  },fallback:()=>fallback++});
  try{
    for(let i=0;i<2;i++)assert.equal(await processor.process({}, {mode:'enhance',enhancementMethod:'fast'},{onProgress:p=>progress.push(p)}),'fast');
    assert.equal(created,1);assert.equal(terminated,0);assert.equal(fallback,0);assert.equal(progress.length,2);
  }finally{processor.dispose();}
  assert.equal(terminated,1);
});

test('cancel stops inference immediately and the next operation starts with a fresh worker',async()=>{
  const workers=[];
  const processor=createImageProcessor({canUseWorker:()=>true,workerFactory:()=>{
    const worker={stopped:false,terminate(){this.stopped=true;},postMessage(){}};workers.push(worker);return worker;
  }});
  try{
    const controller=new AbortController(),pending=processor.process({}, {},{signal:controller.signal});
    controller.abort();await assert.rejects(pending,{name:'AbortError'});
    assert.equal(workers[0].stopped,true);
    const next=processor.process({}, {});
    workers[1].onmessage({data:{kind:'done',result:'ready'}});
    assert.equal(await next,'ready');assert.equal(workers.length,2);
  }finally{processor.dispose();}
});

test('AI errors stay visible instead of retrying on the UI thread or silently using a filter',async()=>{
  let fallback=0;
  const processor=createImageProcessor({canUseWorker:()=>true,workerFactory:()=>({terminate(){},postMessage(){queueMicrotask(()=>this.onmessage({data:{kind:'error',code:'AI_LOAD'}}));}}),fallback:()=>fallback++});
  try{await assert.rejects(processor.process({}, {}),error=>error.code==='AI_LOAD');assert.equal(fallback,0);}
  finally{processor.dispose();}
});
