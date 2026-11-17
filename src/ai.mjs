import{createCanvasSurface}from'./canvas-surface.mjs';
import{enhanceStream}from'./ai-stream.mjs';
import{getBrowserRunner}from'./ai-runtime.mjs';
export async function enhanceCanvas(image,width,height,output,settings,{signal,onProgress=()=>{}}={}){
  const ai=settings.enhancementMethod!=='classic';
  let runner=null,surface=null;
  try{
    if(ai)runner=await getBrowserRunner(settings.enhancementMethod||'photo',{signal,onProgress});
    surface=createCanvasSurface(image,width,height,output,{type:settings.outputType,background:settings.background,contrast:settings.contrast});
    return await enhanceStream(surface,runner,{
      scale:Number(settings.scale),strength:Number(settings.sharpness)/100,
      denoise:Number(settings.denoise)/100*(ai?.35:1),sharpness:ai?0:Number(settings.sharpness)/100,
      tone:surface.tone,tileSize:runner?.tileSize||96,padding:runner?.padding||4,signal,
      onProgress:p=>onProgress({stage:p.stage,value:.22+p.fraction*.64,etaSeconds:p.etaSeconds,backend:p.backend})
    });
  }finally{surface?.dispose();runner?.release();}
}
