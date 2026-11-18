import{ForgeError,LIMITS,inspectImage,targetDimensions,outputType,resizePixels,flattenPixels}from'./engine.mjs';
import{createCanvas}from'./canvas-surface.mjs';
import{processingError}from'./errors.mjs';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function decode(file){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(error){if(/memory|allocat/i.test(error.message||''))throw error;}}
 if(typeof document==='undefined')throw new ForgeError('DECODE');
 const url=URL.createObjectURL(file);
 try{const image=new Image();image.src=url;await image.decode();return image;}catch(error){throw processingError(error,'decode');}finally{URL.revokeObjectURL(url);}
}
export async function encode(canvas,type,quality){
 try{
  const blob=canvas.convertToBlob?await canvas.convertToBlob({type,quality}):await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new ForgeError('ENCODE')),type,quality));
  if(!blob||blob.type!==type)throw new ForgeError('FORMAT_UNAVAILABLE');return blob;
 }catch(error){if(typeof error.code==='string')throw error;const normalized=processingError(error,'encode');if(normalized.code==='PROCESS')normalized.code='ENCODE';throw normalized;}
}
export async function processImage(file,s,{onProgress=()=>{},signal}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 const tick=async()=>{check();await pause();check();};
 let last=0;const report=p=>{last=Math.max(last,Math.min(1,p.value||0));onProgress({...p,value:last});};
 let image,source,output,closed=false,stage='decode';
 const closeSource=()=>{if(!closed){closed=true;try{image?.close?.();}catch{}}};
 try{
  check();if(file.size>LIMITS.fileBytes)throw new ForgeError('FILE_SIZE');
  const meta=inspectImage(await file.arrayBuffer()),type=outputType(s.format,meta.type),quality=Math.min(1,Math.max(.1,(Number(s.quality)||86)/100));
  report({stage:'decode',value:.04});image=await decode(file);check();
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(width*height>LIMITS.inputPixels)throw new ForgeError('INPUT_PIXELS');
  const target=targetDimensions(width,height,s);
  output=createCanvas(target.width,target.height);
  if(s.mode==='enhance'){
    stage='ai';
    const{enhanceCanvas}=await import('./ai.mjs');
    await enhanceCanvas(image,width,height,output,{...s,outputType:type},{signal,onProgress:report});
  }else{
    stage='canvas';const out=output.getContext('2d');if(!out)throw new ForgeError('CANVAS');
    if(target.width===width&&target.height===height){
      if(type==='image/jpeg'){
        const background=s.background||'#ffffff';if(!/^#[0-9a-f]{6}$/i.test(background))throw new ForgeError('BACKGROUND');
        out.fillStyle=background;out.fillRect(0,0,target.width,target.height);
      }
      out.drawImage(image,0,0,width,height);
    }else{
      source=createCanvas(width,height);const context=source.getContext('2d',{willReadFrequently:true});if(!context)throw new ForgeError('CANVAS');
      context.drawImage(image,0,0,width,height);closeSource();
      let data=context.getImageData(0,0,width,height).data;source.width=source.height=1;
      data=await resizePixels(data,width,height,target.width,target.height,n=>report({stage:'resize',value:.1+n*.75}),tick);
      if(type==='image/jpeg')data=flattenPixels(data,s.background||'#ffffff');
      out.putImageData(new ImageData(data,target.width,target.height),0,0);
    }
  }
  closeSource();check();stage='encode';report({stage:'encode',value:.9});await tick();
  const blob=await encode(output,type,quality);check();report({stage:'complete',value:1});
  return{blob,type,width:target.width,height:target.height,sourceWidth:width,sourceHeight:height};
 }catch(error){throw processingError(error,stage);}
 finally{closeSource();if(source)source.width=source.height=1;if(output)output.width=output.height=1;}
}
