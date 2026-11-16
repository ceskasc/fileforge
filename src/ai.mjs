import { enhancePixels } from './engine.mjs';
import { enhanceTiled } from './ai-tiles.mjs';
import { getBrowserRunner } from './ai-runtime.mjs';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function enhanceWithAI(input,width,height,settings,{signal,onProgress=()=>{}}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
  const tick=async()=>{check();await pause();check();};
  check();
  const clean=await enhancePixels(input,width,height,{
    denoise:Math.min(1,Math.max(0,Number(settings.denoise)/100))*.35,
    sharpness:0,contrast:settings.contrast
  },n=>onProgress({stage:'enhance',value:.05+n*.05}),tick);
  const runner=await getBrowserRunner(settings.enhancementMethod||'photo',{signal,onProgress});
  try{
    return await enhanceTiled(clean,width,height,runner,{
      scale:Number(settings.scale),strength:Number(settings.sharpness)/100,
      tileSize:runner.tileSize,padding:runner.padding,signal,tick,
      onProgress:p=>onProgress({stage:'ai',value:.22+p.fraction*.64,etaSeconds:p.etaSeconds,backend:runner.backend})
    });
  }finally{runner.release();}
}
