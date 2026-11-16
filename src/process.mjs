import{ForgeError,LIMITS,inspectImage,targetDimensions,outputType,enhancePixels,resizePixels,flattenPixels}from'./engine.mjs';
const pause=()=>new Promise(r=>setTimeout(r,0));
function canvas(w,h){
 let c;if(typeof document!=='undefined'){c=document.createElement('canvas');c.width=w;c.height=h;}
 else if(typeof OffscreenCanvas!=='undefined')c=new OffscreenCanvas(w,h);else throw new ForgeError('CANVAS');return c;
}
async function decode(file){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}
 if(typeof document==='undefined')throw new ForgeError('DECODE');
 const url=URL.createObjectURL(file);
 try{const image=new Image();image.src=url;await image.decode();return image;}catch{throw new ForgeError('DECODE');}finally{URL.revokeObjectURL(url);}
}
async function encode(c,type,quality){
 try{
  const blob=c.convertToBlob?await c.convertToBlob({type,quality}):await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new ForgeError('ENCODE')),type,quality));
  if(!blob||blob.type!==type)throw new ForgeError('FORMAT_UNAVAILABLE');return blob;
 }catch(e){if(e.code)throw e;throw new ForgeError('ENCODE');}
}
export async function processImage(file,s,{onProgress=()=>{},signal}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 const tick=async()=>{check();await pause();check();};
 check();if(file.size>LIMITS.fileBytes)throw new ForgeError('FILE_SIZE');
 const meta=inspectImage(await file.arrayBuffer()),type=outputType(s.format,meta.type),quality=Math.min(1,Math.max(.1,(Number(s.quality)||86)/100));
 onProgress({stage:'decode',value:.04});const image=await decode(file);let source,output;
 try{
  check();const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(width*height>LIMITS.inputPixels)throw new ForgeError('INPUT_PIXELS');
  const target=targetDimensions(width,height,s);source=canvas(width,height);
  const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)throw new ForgeError('CANVAS');
  ctx.drawImage(image,0,0,width,height);image.close?.();let data=ctx.getImageData(0,0,width,height).data;source.width=source.height=1;
  let workingWidth=width,workingHeight=height;
  if(s.mode==='enhance'&&s.enhancementMethod!=='classic'){
   const{enhanceWithAI}=await import('./ai.mjs');
   const enhanced=await enhanceWithAI(data,width,height,s,{signal,onProgress});
   data=enhanced.data;workingWidth=enhanced.width;workingHeight=enhanced.height;
  }else if(s.mode==='enhance')data=await enhancePixels(data,width,height,{denoise:Number(s.denoise)/100,sharpness:Number(s.sharpness)/100,contrast:s.contrast},n=>onProgress({stage:'enhance',value:.1+n*.47}),tick);
  check();
  if(target.width!==workingWidth||target.height!==workingHeight)data=await resizePixels(data,workingWidth,workingHeight,target.width,target.height,n=>onProgress({stage:'resize',value:(s.mode==='enhance'?.57:.1)+n*(s.mode==='enhance'?.28:.75)}),tick);
  if(type==='image/jpeg')data=flattenPixels(data,s.background||'#ffffff');
  onProgress({stage:'encode',value:.9});output=canvas(target.width,target.height);const out=output.getContext('2d');if(!out)throw new ForgeError('CANVAS');
  out.putImageData(new ImageData(data,target.width,target.height),0,0);await tick();const blob=await encode(output,type,quality);check();
  onProgress({stage:'complete',value:1});return{blob,type,width:target.width,height:target.height,sourceWidth:width,sourceHeight:height};
 }catch(e){if(e.code||e.name==='AbortError')throw e;throw new ForgeError('MEMORY');}
 finally{image.close?.();if(source)source.width=source.height=1;if(output)output.width=output.height=1;}
}
