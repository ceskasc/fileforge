import{ForgeError,flattenPixels}from'./engine.mjs';
import{reflect}from'./ai-tiles.mjs';
import{estimateTone}from'./ai-stream.mjs';
export function createCanvas(width,height){
  let canvas;
  if(typeof document!=='undefined'){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;}
  else if(typeof OffscreenCanvas!=='undefined')canvas=new OffscreenCanvas(width,height);
  else throw new ForgeError('CANVAS');
  return canvas;
}
/** Read crops from the decoded source. Never read the entire photograph into JS. */
export function createCanvasSurface(image,width,height,output,{type='image/png',background='#ffffff',contrast=false}={}){
  const scratch=createCanvas(1,1),ctx=scratch.getContext('2d',{willReadFrequently:true}),out=output.getContext('2d');
  if(!ctx||!out)throw new ForgeError('CANVAS');
  let tone=null;
  if(contrast){
    const factor=Math.min(1,256/Math.max(width,height)),w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor)),thumb=createCanvas(w,h);
    try{
      const tc=thumb.getContext('2d',{willReadFrequently:true});if(!tc)throw new ForgeError('CANVAS');
      tc.drawImage(image,0,0,width,height,0,0,w,h);tone=estimateTone(tc.getImageData(0,0,w,h).data);
    }finally{thumb.width=thumb.height=1;}
  }
  return{
    width,height,tone,
    async read(tile){
      const xs=Array.from({length:tile.patchWidth},(_,i)=>reflect(tile.x+i-tile.padding,width)),ys=Array.from({length:tile.patchHeight},(_,i)=>reflect(tile.y+i-tile.padding,height));
      const left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left+1,h=Math.max(...ys)-top+1;
      scratch.width=w;scratch.height=h;ctx.drawImage(image,left,top,w,h,0,0,w,h);
      const crop=ctx.getImageData(0,0,w,h).data,patch=new Uint8ClampedArray(tile.patchWidth*tile.patchHeight*4);
      for(let y=0;y<tile.patchHeight;y++)for(let x=0;x<tile.patchWidth;x++){
        const p=(y*tile.patchWidth+x)*4,q=((ys[y]-top)*w+xs[x]-left)*4;
        patch[p]=crop[q];patch[p+1]=crop[q+1];patch[p+2]=crop[q+2];patch[p+3]=crop[q+3];
      }
      return patch;
    },
    async write(tile,data,w,h,scale){
      const pixels=type==='image/jpeg'?flattenPixels(data,background):data;
      out.putImageData(new ImageData(pixels,w,h),tile.x*scale,tile.y*scale);
    },
    dispose(){scratch.width=scratch.height=1;}
  };
}
