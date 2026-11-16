import test from'node:test';import assert from'node:assert/strict';import{processImage}from'../src/process.mjs';import{pngHeader}from'./fixtures.mjs';import{installCanvasHarness}from'./canvas-harness.mjs';
const file=(w=2,h=1)=>new Blob([pngHeader(w,h)],{type:'image/png'});
const pixels=new Uint8ClampedArray([255,0,0,128,0,0,255,255]);
test('conversion sends format, quality and composited pixels to encoder without reading a frame',async()=>{
 const h=installCanvasHarness({pixels});try{
  const out=await processImage(file(),{mode:'convert',format:'jpeg',quality:80,background:'#ffffff'});
  assert.equal(out.type,'image/jpeg');const encoded=JSON.parse(await out.blob.text());assert.equal(encoded.quality,.8);
  assert.deepEqual(encoded.pixels,[255,127,127,255,0,0,255,255]);assert.equal(h.metrics.reads.length,0);assert.equal(h.metrics.closed,1);
 }finally{h.restore();}
});
test('classic enhancement uses a live decoded source, bounded crops and exact 2x output',async()=>{
 const h=installCanvasHarness({pixels});try{
  const progress=[],out=await processImage(file(),{mode:'enhance',enhancementMethod:'classic',format:'png',scale:2,denoise:40,sharpness:55,contrast:true,quality:95},{onProgress:p=>progress.push(p)});
  assert.equal(out.width,4);assert.equal(out.height,2);assert.equal(JSON.parse(await out.blob.text()).pixels.length,32);assert.equal(progress.at(-1).value,1);assert.equal(h.metrics.closed,1);
 }finally{h.restore();}
});
test('encoder fallback, cancellation and decoder failures remain distinct',async()=>{
 let h=installCanvasHarness({fallbackFormat:true});try{await assert.rejects(()=>processImage(file(),{mode:'convert',format:'webp'}),e=>e.code==='FORMAT_UNAVAILABLE');}finally{h.restore();}
 h=installCanvasHarness({decodeFailure:true});try{
  await assert.rejects(()=>processImage(file(),{mode:'convert',format:'png'}),e=>e.code==='DECODE');
  const c=new AbortController();c.abort();await assert.rejects(()=>processImage(file(),{mode:'convert',format:'png'},{signal:c.signal}),{name:'AbortError'});
 }finally{h.restore();}
});
test('12 MP conversion does not request a 12 MP JavaScript buffer',async()=>{
 const h=installCanvasHarness({width:4000,height:3000,maxReadPixels:65536});try{
  const out=await processImage(file(4000,3000),{mode:'convert',format:'png'});assert.equal(out.width,4000);assert.equal(out.height,3000);assert.equal(h.metrics.reads.length,0);
 }finally{h.restore();}
});
test('an unrelated rendering bug is never reported as a device memory failure',async()=>{
 const h=installCanvasHarness({drawFailure:new TypeError('Deliberate renderer failure')});try{
  await assert.rejects(()=>processImage(file(),{mode:'convert',format:'png'}),e=>e.code==='PROCESS'&&e.cause instanceof TypeError);
 }finally{h.restore();}
});
