import test from'node:test';import assert from'node:assert/strict';
import{planTiles,extractPatch,enhanceTiled,reflect}from'../src/ai-tiles.mjs';
import{resizePixels}from'../src/engine.mjs';
import{image}from'./fixtures.mjs';
const nearest={async predict(rgb,w,h){const out=new Uint8ClampedArray(w*h*4*3);for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++){const p=(Math.floor(y/2)*w+Math.floor(x/2))*3;out.set(rgb.slice(p,p+3),(y*w*2+x)*3);}return out;}};
test('padded tile plan covers every pixel exactly once including partial edges',()=>{
 const counts=new Uint8Array(9*7),tiles=planTiles(9,7,4,2);assert.equal(tiles.length,6);
 for(const t of tiles)for(let y=t.y;y<t.y+t.height;y++)for(let x=t.x;x<t.x+t.width;x++)counts[y*9+x]++;
 assert.ok(counts.every(n=>n===1));assert.deepEqual([reflect(-1,4),reflect(4,4),reflect(123,1)],[1,2,0]);
 assert.throws(()=>planTiles(3,3,0,2),e=>e.code==='DIMENSIONS');
});
test('patch extraction mirrors borders and composites transparency before neural input',()=>{
 const a=new Uint8ClampedArray([255,0,0,255,0,0,255,0]),tile=planTiles(2,1,2,1)[0],patch=extractPatch(a,2,1,tile);
 assert.deepEqual([...patch.slice(0,6)],[255,255,255,255,0,0]);
});
test('1x enhancement is invariant to tile boundaries and leaves source pixels untouched',async()=>{
 const a=image(11,7,(x,y)=>[30+x*10,50+y*12,90,255]),before=new Uint8ClampedArray(a);
 const small=await enhanceTiled(a,11,7,nearest,{scale:1,tileSize:3,padding:4,strength:1});
 const large=await enhanceTiled(a,11,7,nearest,{scale:1,tileSize:8,padding:4,strength:1});
 assert.deepEqual(small.data,large.data);assert.deepEqual(a,before);assert.equal(small.width,11);
});
test('2x has exact output dimensions, preserves alpha and blends opaque pixels only',async()=>{
 const a=image(5,3,(x,y)=>[50+x*12,80+y*12,100,x===0?0:x===1?128:255]);
 const baseline=await resizePixels(a,5,3,10,6),out=await enhanceTiled(a,5,3,nearest,{scale:2,tileSize:2,padding:3});
 assert.equal(out.width,10);assert.equal(out.height,6);
 for(let p=0;p<out.data.length;p+=4){assert.equal(out.data[p+3],baseline[p+3]);if(!out.data[p+3])assert.deepEqual([...out.data.slice(p,p+3)],[0,0,0]);}
});
test('neural tile errors, invalid geometry and cancellation never return a partial image',async()=>{
 const a=image(8,8,()=>[100,120,140,255]),controller=new AbortController();let calls=0;
 const runner={async predict(...args){calls++;const out=await nearest.predict(...args);controller.abort();return out;}};
 await assert.rejects(()=>enhanceTiled(a,8,8,runner,{signal:controller.signal,tileSize:4,padding:2}),{name:'AbortError'});assert.equal(calls,1);
 await assert.rejects(()=>enhanceTiled(a,8,8,{async predict(){return new Uint8ClampedArray(1);}},{tileSize:4,padding:2}),e=>e.code==='AI_INFERENCE');
 await assert.rejects(()=>enhanceTiled(new Uint8ClampedArray(16000*4),16000,1,nearest,{scale:1}),e=>e.code==='OUTPUT_PIXELS');
});
test('progress is monotonic, reaches completion and reports an honest remaining-time estimate',async()=>{
 const progress=[];await enhanceTiled(image(6,6,()=>[90,120,140,255]),6,6,nearest,{tileSize:3,padding:2,onProgress:p=>progress.push(p),tick:async()=>{}});
 assert.equal(progress.at(-1).fraction,1);assert.equal(progress.at(-1).etaSeconds,0);assert.ok(progress.every((p,i)=>!i||p.fraction>=progress[i-1].fraction));
});
