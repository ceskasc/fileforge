import {ForgeError,enhancePixels,resizePixels,LIMITS} from './engine.mjs';
import {planTiles} from './ai-tiles.mjs';
import {isMemoryPressure} from './errors.mjs';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const check=signal=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
export function estimateTone(data){
  const hist=new Uint32Array(256);let count=0;
  for(let p=0;p<data.length;p+=4)if(data[p+3]>127){hist[Math.round(.2126*data[p]+.7152*data[p+1]+.0722*data[p+2])]++;count++;}
  if(!count)return{gain:1,offset:0};
  let lo=0,hi=255,sum=0;
  for(;lo<255;lo++){sum+=hist[lo];if(sum>=count*.005)break;}
  sum=0;for(;hi>lo;hi--){sum+=hist[hi];if(sum>=count*.005)break;}
  if(hi-lo<=30||hi-lo>=240)return{gain:1,offset:0};
  const gain=Math.min(1.15,255/(hi-lo)),offset=Math.max(-16,Math.min(16,127.5-(hi+lo)*gain/2));
  return{gain,offset};
}
function tonePatch(data,tone){
  if(!tone||tone.gain===1&&tone.offset===0)return;
  for(let p=0;p<data.length;p+=4)if(data[p+3]){
    const y=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2],d=Math.max(-20,Math.min(20,y*tone.gain+tone.offset-y));
    for(let c=0;c<3;c++)data[p+c]+=d;
  }
}
function split(tile,size){
  const result=[];
  for(let y=tile.y;y<tile.y+tile.height;y+=size)for(let x=tile.x;x<tile.x+tile.width;x+=size)result.push({
    x,y,width:Math.min(size,tile.x+tile.width-x),height:Math.min(size,tile.y+tile.height-y),
    padding:tile.padding,patchWidth:size+2*tile.padding,patchHeight:size+2*tile.padding
  });
  return result;
}
/** Only a source tile, its neural prediction and its output tile are resident in JS. */
export async function enhanceStream(surface,runner,{scale=1,strength=.8,denoise=0,sharpness=0,tone=null,tileSize=48,padding=16,signal,onProgress=()=>{},tick=pause}={}){
  const{width,height}=surface;
  if(![1,2].includes(scale)||width*height>LIMITS.inputPixels)throw new ForgeError('DIMENSIONS');
  if(width*height*scale*scale>LIMITS.outputPixels||Math.max(width,height)*scale>LIMITS.edge)throw new ForgeError('OUTPUT_PIXELS');
  const queue=planTiles(width,height,tileSize,padding),mix=Math.max(0,Math.min(1,strength));
  let index=0,done=0,size=tileSize,recovered=false,elapsedPerPixel=0;
  const total=width*height;
  const progress=(stage='ai')=>onProgress({stage,fraction:done/total,etaSeconds:done&&elapsedPerPixel?Math.ceil((total-done)*elapsedPerPixel/1000):null,backend:runner?.backend});
  progress(runner?'ai':'enhance');
  while(index<queue.length){
    check(signal);await tick();check(signal);
    const tile=queue[index],start=Date.now();
    try{
      let clean=await surface.read(tile);
      check(signal);
      if(!(clean instanceof Uint8ClampedArray)||clean.length!==tile.patchWidth*tile.patchHeight*4)throw new ForgeError('PROCESS');
      tonePatch(clean,tone);
      if(denoise>0||!runner&&sharpness>0)clean=await enhancePixels(clean,tile.patchWidth,tile.patchHeight,{denoise,sharpness:runner?0:sharpness,contrast:false},()=>{},async()=>{check(signal);await tick();});
      const pw=tile.patchWidth,ph=tile.patchHeight;
      let neural=null,baseline=clean;
      if(runner){
        const rgb=new Float32Array(pw*ph*3);
        for(let p=0,q=0;p<clean.length;p+=4,q+=3){const a=clean[p+3]/255;for(let c=0;c<3;c++)rgb[q+c]=clean[p+c]*a+255*(1-a);}
        const predicted=await runner.predict(rgb,pw,ph);check(signal);
        if(!(predicted instanceof Uint8ClampedArray)||predicted.length!==pw*ph*12)throw new ForgeError('AI_INFERENCE');
        neural=new Uint8ClampedArray(pw*ph*16);
        for(let p=0,q=0;p<neural.length;p+=4,q+=3){neural[p]=predicted[q];neural[p+1]=predicted[q+1];neural[p+2]=predicted[q+2];neural[p+3]=255;}
        if(scale===1)neural=await resizePixels(neural,pw*2,ph*2,pw,ph,()=>{},async()=>{check(signal);await tick();});
      }
      if(scale===2)baseline=await resizePixels(clean,pw,ph,pw*2,ph*2,()=>{},async()=>{check(signal);await tick();});
      const ow=tile.width*scale,oh=tile.height*scale,rowWidth=pw*scale,offset=tile.padding*scale,result=new Uint8ClampedArray(ow*oh*4);
      for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
        const p=(y*ow+x)*4,q=((y+offset)*rowWidth+x+offset)*4,a=baseline[q+3];
        result[p+3]=a;
        if(!a)continue;
        for(let c=0;c<3;c++)result[p+c]=runner&&a===255?baseline[q+c]*(1-mix)+neural[q+c]*mix:baseline[q+c];
      }
      check(signal);await surface.write(tile,result,ow,oh,scale);check(signal);
      const pixels=tile.width*tile.height,rate=(Date.now()-start)/pixels;
      elapsedPerPixel=done?.75*elapsedPerPixel+.25*rate:rate;done+=pixels;index++;progress(runner?'ai':'enhance');
    }catch(error){
      if(error?.name==='AbortError')throw error;
      if(!isMemoryPressure(error))throw error;
      if(size>8){
        size=Math.max(8,Math.floor(size/2));
        const pending=queue.slice(index).flatMap(t=>split(t,size));queue.splice(index,queue.length-index,...pending);
        progress('memory');await tick();continue;
      }
      if(!recovered&&runner?.recover){recovered=true;if(await runner.recover()){progress('cpu');await tick();continue;}}
      const failure=new ForgeError(runner?'AI_MEMORY':'MEMORY');failure.cause=error;throw failure;
    }
  }
  return{width:width*scale,height:height*scale};
}
