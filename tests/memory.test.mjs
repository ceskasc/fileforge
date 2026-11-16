import test from'node:test';import assert from'node:assert/strict';
import{ForgeError}from'../src/engine.mjs';import{processingError,isMemoryPressure}from'../src/errors.mjs';
import{enhanceStream,estimateTone}from'../src/ai-stream.mjs';import{createCanvas,createCanvasSurface}from'../src/canvas-surface.mjs';
import{installCanvasHarness}from'./canvas-harness.mjs';import{setMemoryBudget}from'../src/ai-runtime.mjs';
const nearest={backend:'webgl',async predict(rgb,w,h){const a=new Uint8ClampedArray(w*h*12);for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++){const p=(Math.floor(y/2)*w+Math.floor(x/2))*3;a.set(rgb.subarray(p,p+3),(y*w*2+x)*3);}return a;}};
function solidSurface(w,h){
 const counts=new Uint8Array(w*h);return{width:w,height:h,counts,reads:[],
  async read(t){this.reads.push(t.patchWidth*t.patchHeight);const a=new Uint8ClampedArray(t.patchWidth*t.patchHeight*4);for(let p=0;p<a.length;p+=4)a.set([90,120,140,255],p);return a;},
  async write(t,data,ow,oh,scale){assert.equal(data.length,ow*oh*4);for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++)counts[(t.y+y)*w+t.x+x]++;}
 };
}
test('error classification distinguishes allocation pressure from ordinary exceptions and DOM numeric codes',()=>{
 assert.ok(isMemoryPressure(new RangeError('Array buffer allocation failed')));
 assert.equal(processingError(new TypeError('broken renderer')).code,'PROCESS');
 assert.equal(processingError(new DOMException('invalid state','InvalidStateError')).code,'PROCESS');
 assert.equal(processingError(new RangeError('Array buffer allocation failed'),'ai').code,'AI_MEMORY');
 const abort=new DOMException('Stopped','AbortError');assert.equal(processingError(abort),abort);
});
test('allocation failure retries with smaller tiles while preserving every source pixel and output dimensions',async()=>{
 const surface=solidSurface(70,53),progress=[];let failures=0;
 const runner={...nearest,async predict(rgb,w,h){if(w>40||h>40){failures++;throw new ForgeError('AI_MEMORY');}return nearest.predict(rgb,w,h);}};
 const out=await enhanceStream(surface,runner,{tileSize:48,padding:4,onProgress:p=>progress.push(p),tick:async()=>{}});
 assert.ok(failures>0);assert.deepEqual(out,{width:70,height:53});assert.ok(surface.counts.every(n=>n===1));
 assert.ok(progress.some(p=>p.stage==='memory'));assert.ok(progress.every((p,i)=>!i||p.fraction>=progress[i-1].fraction));assert.equal(progress.at(-1).fraction,1);
});
test('a lost GPU context can retry the same model on CPU without falling back to filters',async()=>{
 const surface=solidSurface(8,8);let cpu=false,recoveries=0,predictions=0;
 const runner={get backend(){return cpu?'cpu':'webgl';},async predict(...args){predictions++;if(!cpu)throw new ForgeError('AI_MEMORY');return nearest.predict(...args);},async recover(){cpu=true;recoveries++;return true;}};
 await enhanceStream(surface,runner,{tileSize:8,padding:2,tick:async()=>{}});assert.equal(recoveries,1);assert.equal(predictions,2);assert.ok(surface.counts.every(n=>n===1));
});
test('a 12 MP photograph is read through small canvas crops, with no full-frame pixel array',async()=>{
 const harness=installCanvasHarness({width:4000,height:3000,maxReadPixels:65536}),controller=new AbortController();
 let surface;
 try{
  const image=await createImageBitmap(new Blob()),out=createCanvas(4000,3000);surface=createCanvasSurface(image,4000,3000,out,{contrast:true});
  await assert.rejects(()=>enhanceStream(surface,nearest,{tileSize:48,padding:16,tone:surface.tone,signal:controller.signal,onProgress:p=>{if(p.fraction>0)controller.abort();},tick:async()=>{}}),{name:'AbortError'});
  assert.ok(harness.metrics.reads.length>=2);assert.ok(harness.metrics.reads.every(r=>r.width*r.height<=65536));assert.equal(out.width,4000);assert.equal(out.height,3000);
  assert.equal(harness.metrics.writes[0].width,48);image.close();
 }finally{surface?.dispose();harness.restore();}
});
test('global thumbnail tone is shared by tiles and transparent borders retain their alpha',async()=>{
 const h=installCanvasHarness({width:5,height:3,pixels:(x)=>[90,120,140,x===0?0:x===1?128:255]});let surface;
 try{
  const image=await createImageBitmap(new Blob()),out=createCanvas(5,3);surface=createCanvasSurface(image,5,3,out);
  await enhanceStream(surface,nearest,{tileSize:2,padding:4,tone:estimateTone(new Uint8ClampedArray([90,120,140,255])),tick:async()=>{}});
  const data=out.getContext('2d').getImageData(0,0,5,3).data;
  assert.deepEqual([data[3],data[7],data[11]],[0,128,255]);assert.deepEqual([...data.slice(0,3)],[0,0,0]);
 }finally{surface?.dispose();h.restore();}
});
test('WebGL free texture cache is explicitly bounded on compact devices',()=>{
 const calls=[];setMemoryBudget({env:()=>({set:(name,value)=>calls.push([name,value])})},true);
 assert.deepEqual(calls,[['WEBGL_DELETE_TEXTURE_THRESHOLD',16*1024*1024]]);
});
