import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createRequire}from'node:module';
import{AI_MODELS,registerModelLayers,createModelRunner}from'../src/ai-runtime.mjs';
import{extractPatch}from'../src/ai-tiles.mjs';import{enhanceStream}from'../src/ai-stream.mjs';import{image}from'./fixtures.mjs';
const require=createRequire(import.meta.url),tf=require('../.ai-cache/runtime/tf.cjs'),results=[];
await tf.setBackend('cpu');await tf.ready();registerModelLayers(tf);
for(const method of['fast','photo','ultra'])test('real '+method+' weights run through the production tile engine with finite, nontrivial output',async()=>{
 const json=JSON.parse(readFileSync('.ai-cache/models/'+method+'/model.json','utf8')),specs=json.weightsManifest.flatMap(g=>g.weights);
 const body=Buffer.concat(json.weightsManifest.flatMap(g=>g.paths.map(p=>readFileSync('.ai-cache/models/'+method+'/'+p))));
 const model=await tf.loadLayersModel(tf.io.fromMemory({modelTopology:json.modelTopology,weightSpecs:specs,weightData:body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)}));
 const before=tf.memory().numTensors,start=Date.now();
 try{
  const source=image(6,6,(x,y)=>[55+x*22,70+y*18,110+(x+y)%3*14,255]);
  const runner=createModelRunner(tf,model,AI_MODELS[method]);
  const data=new Uint8ClampedArray(12*12*4);
  const surface={width:6,height:6,async read(tile){
    const rgb=extractPatch(source,6,6,tile),rgba=new Uint8ClampedArray(tile.patchWidth*tile.patchHeight*4);
    for(let p=0,q=0;p<rgba.length;p+=4,q+=3){rgba[p]=rgb[q];rgba[p+1]=rgb[q+1];rgba[p+2]=rgb[q+2];rgba[p+3]=255;}return rgba;
  },async write(tile,part,w,h,scale){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=((tile.y*scale+y)*12+tile.x*scale+x)*4,q=(y*w+x)*4;data.set(part.subarray(q,q+4),p);}
  }};
  const size=await enhanceStream(surface,runner,{scale:2,strength:1,tileSize:6,padding:2,tick:async()=>{}});
  const out={...size,data};
  assert.equal(out.width,12);assert.equal(out.height,12);assert.equal(out.data.length,12*12*4);
  let difference=0,mean=0,opaque=0;
  for(let y=0;y<12;y++)for(let x=0;x<12;x++){
   const p=(y*12+x)*4,q=(Math.floor(y/2)*6+Math.floor(x/2))*4;
   for(let c=0;c<3;c++){difference+=Math.abs(out.data[p+c]-source[q+c]);mean+=out.data[p+c];}
   if(out.data[p+3]===255)opaque++;
  }
  difference/=12*12*3;mean/=12*12*3;
  assert.ok(difference>.05,'Real model must produce more than a renamed nearest-neighbour resize');
  assert.ok(mean>30&&mean<230,'Input/output normalization must not collapse to black or white');
  assert.equal(opaque,144);assert.equal(tf.memory().numTensors,before,'Inference tensors must be released');
  const second=await runner.predict(new Float32Array(4*4*3).fill(AI_MODELS[method].inputMax===1?128:128),4,4);
  assert.equal(second.length,8*8*3);assert.equal(tf.memory().numTensors,before);
  results.push({method,parameters:model.countParams(),output:[out.width,out.height],meanRGB:mean,meanAbsoluteDifferenceFromNearest:difference,inferenceMs:Date.now()-start,tensorLeak:tf.memory().numTensors-before});
 }finally{model.dispose();}
});
test.after(()=>{writeFileSync('ai-validation.json',JSON.stringify({backend:'cpu',runtime:'TensorFlow.js 4.22.0',realTrainedWeights:true,results},null,2));console.log('AI_VALIDATION '+JSON.stringify(results));});
