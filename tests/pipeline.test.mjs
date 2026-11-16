import test from'node:test';
import assert from'node:assert/strict';
import{processImage}from'../src/process.mjs';
import{pngHeader}from'./fixtures.mjs';
const keys=['createImageBitmap','OffscreenCanvas','ImageData'];
function environment({fallbackFormat=false,decodeFailure=false}={}){
 const previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 globalThis.createImageBitmap=async()=>{if(decodeFailure)throw new Error('invalid');return{width:2,height:1,pixels:new Uint8ClampedArray([255,0,0,128,0,0,255,255]),close(){}};};
 globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 globalThis.OffscreenCanvas=class{
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){return{drawImage:image=>{this.pixels=new Uint8ClampedArray(image.pixels);},getImageData:()=>({data:this.pixels}),putImageData:image=>{this.pixels=image.data;}};}
  async convertToBlob({type,quality}){return new Blob([JSON.stringify({width:this.width,height:this.height,pixels:[...this.pixels],quality})],{type:fallbackFormat?'image/png':type});}
 };
 return()=>{for(const k of keys)if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];};
}
const file=()=>new Blob([pngHeader(2,1)],{type:'image/png'});
test('pipeline sends requested format, quality and composited pixels to encoder',async()=>{
 const restore=environment();try{
  const out=await processImage(file(),{mode:'convert',format:'jpeg',quality:80,background:'#ffffff'});
  assert.equal(out.type,'image/jpeg');assert.equal(out.sourceWidth,2);const encoded=JSON.parse(await out.blob.text());
  assert.equal(encoded.quality,.8);assert.deepEqual(encoded.pixels,[255,127,127,255,0,0,255,255]);
 }finally{restore();}
});
test('classic pipeline integrates filters and 2x pixel geometry before encoding',async()=>{
 const restore=environment();try{
  const progress=[],out=await processImage(file(),{mode:'enhance',enhancementMethod:'classic',format:'png',scale:2,denoise:40,sharpness:55,contrast:true,quality:95},{onProgress:p=>progress.push(p)});
  assert.equal(out.width,4);assert.equal(out.height,2);assert.equal(JSON.parse(await out.blob.text()).pixels.length,32);assert.equal(progress.at(-1).value,1);
 }finally{restore();}
});
test('silent encoder fallback is rejected, rather than downloading mislabeled PNG as WebP',async()=>{
 const restore=environment({fallbackFormat:true});try{await assert.rejects(()=>processImage(file(),{mode:'convert',format:'webp'}),e=>e.code==='FORMAT_UNAVAILABLE');}finally{restore();}
});
test('cancellation and decoder errors are explicit',async()=>{
 const restore=environment({decodeFailure:true});try{
  await assert.rejects(()=>processImage(file(),{mode:'convert',format:'png'}),e=>e.code==='DECODE');
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>processImage(file(),{mode:'convert',format:'png'},{signal:controller.signal}),{name:'AbortError'});
 }finally{restore();}
});
