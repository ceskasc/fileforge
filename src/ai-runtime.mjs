import { ForgeError } from './engine.mjs';
const registered=new WeakSet();
export const AI_MODELS=Object.freeze({
  photo:{path:'photo/model.json',inputMax:255,outputMax:255,tileSize:96,padding:16},
  ultra:{path:'ultra/model.json',inputMax:1,outputMax:1,tileSize:64,padding:24}
});
/** Serialization adapters for the published ESRGAN weights. */
export function registerModelLayers(tf){
  if(registered.has(tf))return;
  class MultiplyBeta extends tf.layers.Layer{
    constructor(config={}){super(config);this.beta=config.beta??.2;}
    call(inputs){return tf.mul(Array.isArray(inputs)?inputs[0]:inputs,this.beta);}
    computeOutputShape(shape){return shape;}
    getConfig(){return{...super.getConfig(),beta:this.beta};}
    static className='MultiplyBeta';
  }
  class PixelShuffle2x extends tf.layers.Layer{
    call(inputs){return tf.depthToSpace(Array.isArray(inputs)?inputs[0]:inputs,2,'NHWC');}
    computeOutputShape(s){return[s[0],s[1]==null?null:s[1]*2,s[2]==null?null:s[2]*2,s[3]==null?null:s[3]/4];}
    static className='PixelShuffle2x';
  }
  tf.serialization.registerClass(MultiplyBeta);tf.serialization.registerClass(PixelShuffle2x);registered.add(tf);
}
export function createModelRunner(tf,model,definition){
  return {async predict(rgb,width,height){
    let prediction;
    try{
      prediction=tf.tidy(()=>{
        let input=tf.tensor4d(rgb,[1,height,width,3],'float32');
        if(definition.inputMax===1)input=input.div(255);
        const raw=model.predict(input),result=Array.isArray(raw)?raw[0]:raw;
        return definition.outputMax===1?result.mul(255):result;
      });
      if(prediction.rank!==4||prediction.shape[0]!==1||prediction.shape[1]!==height*2||prediction.shape[2]!==width*2||prediction.shape[3]!==3)throw new ForgeError('AI_INFERENCE');
      const values=await prediction.data(),output=new Uint8ClampedArray(values.length);
      for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw new ForgeError('AI_INFERENCE');output[i]=values[i];}
      return output;
    }catch(e){if(e.code)throw e;throw new ForgeError('AI_INFERENCE');}
    finally{prediction?.dispose();}
  }};
}
const check=signal=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
function abortable(promise,signal){
  if(!signal)return promise;
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));},cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},e=>{cleanup();reject(e);});
    if(signal.aborted)abort();
  });
}
let runtimePromise,currentModel=null,idleTimer;
function loadRuntime(){
  if(runtimePromise)return runtimePromise;
  runtimePromise=new Promise((resolve,reject)=>{
    if(globalThis.tf){resolve(globalThis.tf);return;}
    if(typeof document==='undefined'){reject(new ForgeError('AI_LOAD'));return;}
    const script=document.createElement('script'),timer=setTimeout(()=>finish(new ForgeError('AI_LOAD')),120000);
    const finish=error=>{clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve(globalThis.tf);};
    script.src=new URL('../vendor/tf.min.js',import.meta.url).href;script.async=true;
    script.onload=()=>finish(globalThis.tf?null:new ForgeError('AI_LOAD'));script.onerror=()=>finish(new ForgeError('AI_LOAD'));document.head.append(script);
  }).catch(e=>{runtimePromise=null;throw e;});
  return runtimePromise;
}
export function releaseAIResources(){
  clearTimeout(idleTimer);
  if(currentModel?.model)currentModel.model.dispose();
  currentModel=null;
}
export async function getBrowserRunner(method,{signal,onProgress=()=>{}}={}){
  const definition=AI_MODELS[method];
  if(!definition)throw new ForgeError('AI_LOAD');
  check(signal);clearTimeout(idleTimer);
  onProgress({stage:'model',value:.11});
  const tf=await abortable(loadRuntime(),signal);check(signal);
  if(!tf.getBackend()){
    let gpu=false;try{gpu=await tf.setBackend('webgl');}catch{}
    if(!gpu)await tf.setBackend('cpu');
  }
  await tf.ready();check(signal);registerModelLayers(tf);
  if(currentModel?.key!==method){
    releaseAIResources();
    const url=new URL('../models/'+definition.path,import.meta.url).href;
    try{
      const model=await tf.loadLayersModel(tf.io.http(url,{
        requestInit:{signal,credentials:'omit',cache:'force-cache'},
        onProgress:n=>onProgress({stage:'model',value:.11+Math.min(1,Math.max(0,n))*.08})
      }));
      if(signal?.aborted){model.dispose();check(signal);}
      currentModel={key:method,model};
    }catch(e){if(e.name==='AbortError')throw e;throw new ForgeError('AI_LOAD');}
  }
  check(signal);
  const backend=tf.getBackend();
  if(backend==='cpu')onProgress({stage:'cpu',value:.2,backend});
  const runner=createModelRunner(tf,currentModel.model,definition);
  return{...runner,backend,tileSize:backend==='cpu'?24:definition.tileSize,padding:definition.padding,
    release(){clearTimeout(idleTimer);idleTimer=setTimeout(releaseAIResources,120000);}
  };
}
