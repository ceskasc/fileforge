import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {registerModelLayers} from '../src/ai-runtime.mjs';

/** Pack the official SRVGG parameters into a self-hosted TF.js Layers model. */
export async function prepareRestorationModel(root){
  const require=createRequire(import.meta.url),tf=require(resolve(root,'runtime/tf.cjs'));
  await tf.setBackend('cpu');await tf.ready();registerModelLayers(tf);
  const input=tf.input({shape:[null,null,3],name:'rgb'});let x=input;
  for(let i=0;i<34;i++){
    x=tf.layers.conv2d({name:'conv_'+i,filters:i===33?48:64,kernelSize:3,strides:1,padding:'same',useBias:true}).apply(x);
    if(i<33)x=tf.layers.prelu({name:'prelu_'+i,sharedAxes:[1,2]}).apply(x);
  }
  const Shuffle=tf.serialization.SerializationMap.getMap().classNameMap.PixelShuffle4x[0];
  const Nearest=tf.serialization.SerializationMap.getMap().classNameMap.Nearest4x[0];
  x=new Shuffle({name:'shuffle4'}).apply(x);
  const base=new Nearest({name:'nearest4'}).apply(input);
  const model=tf.model({inputs:input,outputs:tf.layers.add({name:'residual'}).apply([x,base]),name:'RealESRGAN_general_x4v3'});
  const specs=JSON.parse(readFileSync(root+'/runtime/srvgg-weights.json','utf8')),raw=readFileSync(root+'/runtime/srvgg-weights.bin');
  let offset=0;const weights=[],records=[];
  try{
    for(const spec of specs){
      const count=spec.shape.reduce((a,b)=>a*b,1),part=raw.buffer.slice(raw.byteOffset+offset,raw.byteOffset+offset+count*4);
      offset+=count*4;weights.push(tf.tensor(new Float32Array(part),spec.shape));
    }
    if(offset!==raw.length||model.countParams()!==1213296)throw Error('Invalid SRVGG weight layout');
    model.setWeights(weights);
    const dest=root+'/models/restore';rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
    await model.save(tf.io.withSaveHandler(async artifact=>{
      const binary=Buffer.from(artifact.weightData),hash=createHash('sha256').update(binary).digest('hex'),name='weights-'+hash.slice(0,16)+'.bin';
      const json=Buffer.from(JSON.stringify({format:'layers-model',generatedBy:'FileForge SRVGG conversion v1',modelTopology:artifact.modelTopology,weightsManifest:[{paths:[name],weights:artifact.weightSpecs}]}));
      for(const [file,data] of [[name,binary],['model.json',json]]){
        writeFileSync(dest+'/'+file,data);records.push({path:'models/restore/'+file,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
      }
      return{modelArtifactsInfo:{}};
    }));
    return records;
  }finally{weights.forEach(weight=>weight.dispose());model.dispose();}
}
