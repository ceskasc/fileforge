import {ForgeError} from './engine.mjs';
import {processImage} from './process.mjs';

/** Keep one model worker warm between files; cancellation destroys it immediately. */
export function createImageProcessor({
  canUseWorker=()=>typeof Worker==='function'&&typeof OffscreenCanvas==='function'&&typeof createImageBitmap==='function',
  workerFactory=()=>new Worker(new URL('./image-worker.mjs',import.meta.url),{type:'module'}),
  fallback=processImage,idleMs=60000,timeoutMs=120000
}={}){
  let worker=null,idleTimer,active=false;
  function dispose(){clearTimeout(idleTimer);worker?.terminate();worker=null;}
  return{dispose,async process(file,settings,{signal,onProgress=()=>{}}={}){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(!canUseWorker())return fallback(file,settings,{signal,onProgress});
    if(active)throw new ForgeError('PROCESS');
    clearTimeout(idleTimer);
    try{worker??=workerFactory();}catch{return fallback(file,settings,{signal,onProgress});}
    const current=worker;active=true;
    try{
      return await new Promise((resolve,reject)=>{
        let timer;
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);current.onmessage=current.onerror=null;};
        const fail=error=>{cleanup();dispose();reject(error);};
        const abort=()=>fail(new DOMException('Aborted','AbortError'));
        const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>fail(new ForgeError('PROCESS')),timeoutMs);};
        signal?.addEventListener('abort',abort,{once:true});
        current.onmessage=({data})=>{
          if(data.kind==='progress'){watchdog();onProgress(data);}
          else if(data.kind==='done'){cleanup();resolve(data.result);}
          else if(data.kind==='error')fail(new ForgeError(data.code));
        };
        current.onerror=event=>{event.preventDefault();const error=new ForgeError('CANVAS');error.workerFailure=true;fail(error);};
        watchdog();
        try{current.postMessage({file,settings});}catch(error){fail(error);}
      });
    }catch(error){
      if(error.workerFailure||error.code==='CANVAS'||error.code==='DECODE')return fallback(file,settings,{signal,onProgress});
      throw error;
    }finally{
      active=false;
      if(worker)idleTimer=setTimeout(dispose,idleMs);
    }
  }};
}
