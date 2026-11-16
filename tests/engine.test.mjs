import test from 'node:test';
import assert from 'node:assert/strict';
import{execFileSync}from'node:child_process';
import{inspectImage,targetDimensions,enhancePixels,resizePixels,flattenPixels,crc32,outputName,outputType,uniqueNames,zipImages}from'../src/engine.mjs';
import{pngHeader,jpegHeader,webpHeader,image}from'./fixtures.mjs';
const code=c=>e=>e.code===c;

test('signature detection reads dimensions independently of file names',()=>{
 for(const[data,type]of[[pngHeader(320,240),'image/png'],[jpegHeader(640,480),'image/jpeg'],[webpHeader(1920,1080),'image/webp']]){
  const m=inspectImage(data);assert.equal(m.type,type);assert.ok(m.width>0&&m.height>0);
 }
 assert.deepEqual(inspectImage(jpegHeader(640,480)),{type:'image/jpeg',width:640,height:480});
 assert.deepEqual(inspectImage(webpHeader(1920,1080)),{type:'image/webp',width:1920,height:1080});
});
test('damaged, animated and oversized headers fail before image decoding',()=>{
 assert.throws(()=>inspectImage(new Uint8Array(2)),code('INVALID_FILE'));
 assert.throws(()=>inspectImage(new TextEncoder().encode('not-an-image-file')),code('UNSUPPORTED'));
 assert.throws(()=>inspectImage(new TextEncoder().encode('GIF89a____________')),code('ANIMATED'));
 assert.throws(()=>inspectImage(pngHeader(100,100,true)),code('ANIMATED'));
 assert.throws(()=>inspectImage(webpHeader(100,100,true)),code('ANIMATED'));
 assert.throws(()=>inspectImage(pngHeader(6000,5000)),code('INPUT_PIXELS'));
 assert.throws(()=>inspectImage(jpegHeader(32,32).slice(0,12)),code('INVALID_FILE'));
 const bad=webpHeader(32,32);new DataView(bad.buffer).setUint32(16,999,true);
 assert.throws(()=>inspectImage(bad),code('INVALID_FILE'));
});
test('ratio lock fits inside a box and uses one dimension when the other is empty',()=>{
 assert.deepEqual(targetDimensions(4000,3000,{mode:'resize',width:1920,height:1080,lockAspect:true}),{width:1440,height:1080});
 assert.deepEqual(targetDimensions(3000,4000,{mode:'resize',width:1080,height:'',lockAspect:true}),{width:1080,height:1440});
 assert.deepEqual(targetDimensions(500,250,{mode:'resize',width:1000,lockAspect:true}),{width:500,height:250});
 assert.deepEqual(targetDimensions(500,250,{mode:'resize',width:1000,lockAspect:true,allowUpscale:true}),{width:1000,height:500});
 assert.deepEqual(targetDimensions(400,300,{mode:'resize',width:100,height:100,lockAspect:false}),{width:100,height:100});
});
test('invalid sizes and unsafe 2x outputs are rejected instead of silently clamped',()=>{
 for(const s of[{width:'',height:''},{width:-1},{width:1.2},{width:9000},{width:'bad',height:100}]){
  assert.throws(()=>targetDimensions(300,200,{mode:'resize',...s}),code('DIMENSIONS'));
 }
 assert.throws(()=>targetDimensions(4000,3000,{mode:'enhance',scale:2}),code('OUTPUT_PIXELS'));
 assert.deepEqual(targetDimensions(1000,750,{mode:'enhance',scale:2}),{width:2000,height:1500});
 assert.throws(()=>targetDimensions(100,100,{mode:'enhance',scale:3}),code('DIMENSIONS'));
});
test('denoising reduces flat-field variance without bleeding across a strong edge',async()=>{
 const noisy=image(32,32,(x,y)=>{const v=128+((x+y)%2?7:-7);return[v,v,v,255];});
 const variance=a=>{let sum=0;for(let p=0;p<a.length;p+=4)sum+=(a[p]-128)**2;return sum/(a.length/4);};
 const out=await enhancePixels(noisy,32,32,{denoise:1});
 assert.ok(variance(out)<variance(noisy)*.3);assert.equal(noisy[0],121);
 const edge=image(20,8,x=>x<10?[20,20,20,255]:[230,230,230,255]);
 const clean=await enhancePixels(edge,20,8,{denoise:1});
 assert.ok(clean[(3*20+9)*4]<25);assert.ok(clean[(3*20+10)*4]>225);
});
test('sharpening changes a soft edge, stays bounded and preserves every alpha value',async()=>{
 const data=image(32,4,x=>{const v=x<14?60:x===14?80:x===15?110:x===16?150:x===17?180:200;return[v,v,v,x===0?0:255];});
 const before=new Uint8ClampedArray(data),out=await enhancePixels(data,32,4,{sharpness:.8});
 assert.notDeepEqual(out,data);assert.deepEqual(data,before);
 for(let p=0;p<out.length;p+=4){assert.equal(out[p+3],data[p+3]);assert.ok(Math.abs(out[p]-data[p])<=18);}
});
test('enhancement leaves a solid field stable and reports monotonic completion',async()=>{
 const progress=[],solid=image(8,8,()=>[100,120,140,255]);
 const out=await enhancePixels(solid,8,8,{denoise:.5,sharpness:.8,contrast:true},v=>progress.push(v));
 assert.deepEqual(out,solid);assert.equal(progress.at(-1),1);
 assert.ok(progress.every((v,i)=>v>=0&&v<=1&&(!i||v>=progress[i-1])));
});
test('Lanczos grows to actual 2x dimensions and preserves a constant colour',async()=>{
 const out=await resizePixels(image(5,3,()=>[72,125,180,255]),5,3,10,6);
 assert.equal(out.length,10*6*4);
 for(let p=0;p<out.length;p+=4)assert.deepEqual([...out.slice(p,p+4)],[72,125,180,255]);
});
test('premultiplied-alpha resizing prevents invisible blue from fringing a red edge',async()=>{
 const out=await resizePixels(new Uint8ClampedArray([255,0,0,255,0,0,255,0]),2,1,8,4);
 for(let p=0;p<out.length;p+=4)if(out[p+3]){assert.equal(out[p],255);assert.equal(out[p+1],0);assert.equal(out[p+2],0);}
 const empty=await resizePixels(image(2,2,()=>[22,88,255,0]),2,2,4,4);assert.ok(empty.every(n=>n===0));
});
test('downsampling removes checkerboard aliasing and async work can be cancelled',async()=>{
 const check=image(32,32,(x,y)=>{const v=(x+y)%2?255:0;return[v,v,v,255];});
 const out=await resizePixels(check,32,32,8,8);
 let average=0;for(let p=0;p<out.length;p+=4)average+=out[p];average/=out.length/4;assert.ok(Math.abs(average-127.5)<2);
 let ticks=0;await assert.rejects(()=>resizePixels(check,32,32,64,64,()=>{},async()=>{if(++ticks===2)throw new DOMException('Stopped','AbortError');}),{name:'AbortError'});
});
test('JPEG flattening composites transparency over the selected colour',()=>{
 assert.deepEqual([...flattenPixels(new Uint8ClampedArray([255,0,0,0,255,0,0,128]),'#ffffff')],[255,255,255,255,255,127,127,255]);
 assert.throws(()=>flattenPixels(new Uint8ClampedArray(4),'invalid'),code('BACKGROUND'));
});
test('output format and names agree; filenames remain safe and duplicate-free',()=>{
 assert.equal(outputType('original','image/png'),'image/png');assert.throws(()=>outputType('gif','image/png'),code('UNSUPPORTED'));
 assert.equal(outputName('fotoğraf.png','image/webp','enhance'),'fotoğraf-enhanced.webp');
 assert.ok(!/[\\/]/.test(outputName('../../a.jpg','image/png')));
 assert.deepEqual(uniqueNames(['a.jpg','a.jpg','A.jpg','a-2.jpg']),['a.jpg','a-2.jpg','A-3.jpg','a-2-2.jpg']);
});
test('CRC32 matches the standard test vector',()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('ZIP is readable by Python zipfile with UTF-8 names, CRC and duplicate resolution',async()=>{
 const blob=await zipImages([{name:'çığ.jpg',blob:new Blob(['first'])},{name:'çığ.jpg',blob:new Blob(['second'])}]);
 const py="import sys,io,zipfile,json;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))";
 const result=JSON.parse(execFileSync('python3',['-c',py],{input:Buffer.from(await blob.arrayBuffer()),encoding:'utf8'}));
 assert.deepEqual(result,{'çığ.jpg':'first','çığ-2.jpg':'second'});
 await assert.rejects(()=>zipImages([]),code('ARCHIVE'));
});
