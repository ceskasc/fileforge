import { ForgeError, LIMITS, resizePixels } from './engine.mjs';
const check = signal => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export function reflect(index, size) {
  if (size === 1) return 0;
  const period = 2 * size - 2, p = ((index % period) + period) % period;
  return p < size ? p : period - p;
}
export function planTiles(width, height, tileSize = 96, padding = 16) {
  if (![width,height,tileSize].every(n=>Number.isInteger(n)&&n>0) || !Number.isInteger(padding) || padding < 0 || tileSize > 256 || padding > 64) throw new ForgeError('DIMENSIONS');
  if (width*height > LIMITS.inputPixels) throw new ForgeError('INPUT_PIXELS');
  const coreWidth=Math.min(tileSize,width),coreHeight=Math.min(tileSize,height),tiles=[];
  for(let y=0;y<height;y+=coreHeight)for(let x=0;x<width;x+=coreWidth)tiles.push({
    x,y,width:Math.min(coreWidth,width-x),height:Math.min(coreHeight,height-y),
    patchWidth:coreWidth+2*padding,patchHeight:coreHeight+2*padding,padding
  });
  return tiles;
}
export function extractPatch(input, width, height, tile) {
  const rgb=new Float32Array(tile.patchWidth*tile.patchHeight*3);
  for(let y=0;y<tile.patchHeight;y++)for(let x=0;x<tile.patchWidth;x++){
    const p=(reflect(tile.y+y-tile.padding,height)*width+reflect(tile.x+x-tile.padding,width))*4,q=(y*tile.patchWidth+x)*3,a=input[p+3]/255;
    for(let c=0;c<3;c++)rgb[q+c]=input[p+c]*a+255*(1-a);
  }
  return rgb;
}
/** Stream padded neural tiles directly into the final image: no full-size GPU output tensor. */
export async function enhanceTiled(input,width,height,runner,{scale=1,strength=.8,tileSize=96,padding=16,signal,onProgress=()=>{},tick=pause}={}) {
  if (!(input instanceof Uint8ClampedArray) || input.length!==width*height*4 || ![1,2].includes(scale)) throw new ForgeError('DIMENSIONS');
  const ow=width*scale,oh=height*scale;
  if(ow*oh>LIMITS.outputPixels||Math.max(ow,oh)>LIMITS.edge)throw new ForgeError('OUTPUT_PIXELS');
  check(signal);
  const mix=Math.min(1,Math.max(0,Number(strength)||0));
  const output=scale===1?new Uint8ClampedArray(input):await resizePixels(input,width,height,ow,oh,()=>{},async()=>{check(signal);await tick();});
  const tiles=planTiles(width,height,tileSize,padding);
  let completed=0,averageMs=0;
  onProgress({fraction:0,tiles:tiles.length,completed:0,etaSeconds:null});
  for(const tile of tiles){
    check(signal);await tick();check(signal);
    const start=Date.now(),patch=extractPatch(input,width,height,tile);
    const predicted=await runner.predict(patch,tile.patchWidth,tile.patchHeight);
    check(signal);
    const pw=tile.patchWidth*2,ph=tile.patchHeight*2;
    if(!(predicted instanceof Uint8ClampedArray)||predicted.length!==pw*ph*3)throw new ForgeError('AI_INFERENCE');
    let rgba=new Uint8ClampedArray(pw*ph*4);
    for(let p=0,q=0;p<rgba.length;p+=4,q+=3){rgba[p]=predicted[q];rgba[p+1]=predicted[q+1];rgba[p+2]=predicted[q+2];rgba[p+3]=255;}
    if(scale===1)rgba=await resizePixels(rgba,pw,ph,tile.patchWidth,tile.patchHeight,()=>{},async()=>{check(signal);await tick();});
    const rowWidth=tile.patchWidth*scale,offset=tile.padding*scale;
    for(let y=0;y<tile.height*scale;y++)for(let x=0;x<tile.width*scale;x++){
      const p=((tile.y*scale+y)*ow+tile.x*scale+x)*4,q=((y+offset)*rowWidth+x+offset)*4;
      // Preserve the original alpha and its anti-aliased colours.
      if(output[p+3]===0){output[p]=output[p+1]=output[p+2]=0;continue;}
      if(output[p+3]<254)continue;
      for(let c=0;c<3;c++)output[p+c]=output[p+c]*(1-mix)+rgba[q+c]*mix;
    }
    completed++;
    const elapsed=Date.now()-start;
    averageMs=completed===1?elapsed:.75*averageMs+.25*elapsed;
    onProgress({fraction:completed/tiles.length,tiles:tiles.length,completed,etaSeconds:completed>1?Math.ceil(averageMs*(tiles.length-completed)/1000):null});
    await tick();
  }
  return {data:output,width:ow,height:oh};
}
