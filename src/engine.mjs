export const LIMITS=Object.freeze({files:10,fileBytes:25*1024**2,queueBytes:80*1024**2,inputPixels:24_000_000,outputPixels:16_000_000,edge:8192,outputBytes:96*1024**2});
export class ForgeError extends Error{constructor(code){super(code);this.name='ForgeError';this.code=code;}}
const fail=code=>{throw new ForgeError(code);};
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const ascii=(a,i,n)=>String.fromCharCode(...a.subarray(i,i+n));
const u16=(a,i)=>(a[i]<<8)|a[i+1];
const u32=(a,i)=>((a[i]*0x1000000)+(a[i+1]<<16)+(a[i+2]<<8)+a[i+3])>>>0;
const le32=(a,i)=>(a[i]|a[i+1]<<8|a[i+2]<<16|a[i+3]<<24)>>>0;
const le24=(a,i)=>a[i]|a[i+1]<<8|a[i+2]<<16;
function dimensions(type,width,height,animated=false){
 if(animated)fail('ANIMATED');
 if(!width||!height||!Number.isSafeInteger(width*height))fail('INVALID_FILE');
 if(width*height>LIMITS.inputPixels||Math.max(width,height)>32768)fail('INPUT_PIXELS');
 return{type,width,height};
}
/** Validate signatures and dimensions before allocating decoded image memory. */
export function inspectImage(input){
 const a=input instanceof Uint8Array?input:new Uint8Array(input);
 if(a.length<12)fail('INVALID_FILE');
 if(ascii(a,0,3)==='GIF')fail('ANIMATED');
 if(a[0]===137&&ascii(a,1,3)==='PNG'&&a[4]===13&&a[5]===10&&a[6]===26&&a[7]===10){
  if(a.length<33||ascii(a,12,4)!=='IHDR'||u32(a,8)!==13)fail('INVALID_FILE');
  let animated=false;
  for(let p=8;p+12<=a.length;){
   const n=u32(a,p),kind=ascii(a,p+4,4);
   if(n>a.length-p-12)fail('INVALID_FILE');
   if(kind==='acTL')animated=true;
   if(kind==='IDAT'||kind==='IEND')break;
   p+=n+12;
  }
  return dimensions('image/png',u32(a,16),u32(a,20),animated);
 }
 if(a[0]===255&&a[1]===216){
  let p=2;
  while(p+3<a.length){
   if(a[p++]!==255)fail('INVALID_FILE');
   while(a[p]===255)p++;
   const m=a[p++];
   if(m===217||m===218)break;
   if(m===1||(m>=208&&m<=215))continue;
   const n=u16(a,p);
   if(n<2||p+n>a.length)fail('INVALID_FILE');
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)){
    if(n<8)fail('INVALID_FILE');
    return dimensions('image/jpeg',u16(a,p+5),u16(a,p+3));
   }
   p+=n;
  }
  fail('INVALID_FILE');
 }
 if(ascii(a,0,4)==='RIFF'&&ascii(a,8,4)==='WEBP'){
  const end=le32(a,4)+8;
  if(end>a.length||end<20)fail('INVALID_FILE');
  let width=0,height=0,animated=false;
  for(let p=12;p+8<=end;){
   const kind=ascii(a,p,4),n=le32(a,p+4),d=p+8;
   if(d+n>end)fail('INVALID_FILE');
   if(kind==='VP8X'&&n>=10){animated||=!!(a[d]&2);width=le24(a,d+4)+1;height=le24(a,d+7)+1;}
   if(kind==='ANIM'||kind==='ANMF')animated=true;
   if(!width&&kind==='VP8L'&&n>=5&&a[d]===47){width=1+((a[d+1]|a[d+2]<<8)&16383);height=1+((a[d+2]>>6|a[d+3]<<2|a[d+4]<<10)&16383);}
   if(!width&&kind==='VP8 '&&n>=10&&a[d+3]===157&&a[d+4]===1&&a[d+5]===42){width=(a[d+6]|a[d+7]<<8)&16383;height=(a[d+8]|a[d+9]<<8)&16383;}
   p=d+n+(n&1);
  }
  return dimensions('image/webp',width,height,animated);
 }
 fail('UNSUPPORTED');
}
export function targetDimensions(width,height,s){
 if(![width,height].every(n=>Number.isInteger(n)&&n>0))fail('DIMENSIONS');
 let w=width,h=height;
 if(s.mode==='resize'){
  const rw=s.width===''||s.width==null?0:Number(s.width),rh=s.height===''||s.height==null?0:Number(s.height);
  if(![rw,rh].every(n=>Number.isInteger(n)&&n>=0&&n<=LIMITS.edge)||(!rw&&!rh))fail('DIMENSIONS');
  if(s.lockAspect!==false||!rw||!rh){
   let factor=Math.min(rw?rw/width:Infinity,rh?rh/height:Infinity);
   if(!s.allowUpscale)factor=Math.min(1,factor);
   w=Math.max(1,Math.round(width*factor));h=Math.max(1,Math.round(height*factor));
  }else{w=s.allowUpscale?rw:Math.min(width,rw);h=s.allowUpscale?rh:Math.min(height,rh);}
 }
 if(s.mode==='enhance'){
  if(![1,2].includes(Number(s.scale)))fail('DIMENSIONS');
  w*=Number(s.scale);h*=Number(s.scale);
 }
 if(w*h>LIMITS.outputPixels||Math.max(w,h)>LIMITS.edge)fail('OUTPUT_PIXELS');
 return{width:w,height:h};
}
export function outputType(format,sourceType){
 const type=format==='original'?sourceType:({jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[format];
 if(!['image/jpeg','image/png','image/webp'].includes(type))fail('UNSUPPORTED');
 return type;
}
export function outputName(name,type,mode=''){
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type]||'png';
 const stem=String(name).replace(/\.[^.]*$/,'').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g,'-').replace(/^\.+|[. ]+$/g,'').slice(0,100)||'gorsel';
 return stem+(( {enhance:'-enhanced',resize:'-resized',compress:'-compressed',convert:'-converted'})[mode]||'-fileforge')+'.'+ext;
}
const luma=(a,p)=>.2126*a[p]+.7152*a[p+1]+.0722*a[p+2];
function validPixels(a,w,h){if(!(a instanceof Uint8ClampedArray)||a.length!==w*h*4)fail('DIMENSIONS');}
const noTick=async()=>{};
/** Edge-aware denoise and bounded luma unsharp mask. Alpha is preserved. */
export async function enhancePixels(input,width,height,opts={},onProgress=()=>{},tick=noTick){
 validPixels(input,width,height);let data=input;
 const noise=clamp(Number(opts.denoise)||0,0,1),sharp=clamp(Number(opts.sharpness)||0,0,1);
 if(opts.contrast){
  const hist=new Uint32Array(256);let count=0;
  for(let p=0;p<data.length;p+=4){if(data[p+3]>127){hist[Math.round(luma(data,p))]++;count++;}if((p&0x7ffff)===0)await tick();}
  let lo=0,hi=255,sum=0;
  for(;lo<255;lo++){sum+=hist[lo];if(sum>=count*.005)break;}
  sum=0;for(;hi>lo;hi--){sum+=hist[hi];if(sum>=count*.005)break;}
  if(count&&hi-lo>30&&hi-lo<240){
   const gain=Math.min(1.15,255/(hi-lo)),offset=clamp(127.5-(hi+lo)*gain/2,-16,16),out=new Uint8ClampedArray(data);
   for(let p=0;p<data.length;p+=4){
    if(data[p+3]){const y=luma(data,p),delta=clamp(y*gain+offset-y,-20,20);for(let c=0;c<3;c++)out[p+c]=data[p+c]+delta;}
    if((p&0x7ffff)===0)await tick();
   }data=out;
  }
 }
 onProgress(.15);
 if(noise>0){
  const out=new Uint8ClampedArray(data);
  for(let y=0;y<height;y++){
   for(let x=0;x<width;x++){
    const p=(y*width+x)*4;if(data[p+3]<8)continue;
    const center=luma(data,p);let weight=0,r=0,g=0,b=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const q=(clamp(y+dy,0,height-1)*width+clamp(x+dx,0,width-1))*4;
     if(Math.abs(data[q+3]-data[p+3])>16)continue;
     const diff=center-luma(data,q),w=(dx===0?2:1)*(dy===0?2:1)*Math.exp(-diff*diff/648);
     r+=data[q]*w;g+=data[q+1]*w;b+=data[q+2]*w;weight+=w;
    }
    if(weight){const m=noise*.85;out[p]=data[p]*(1-m)+r/weight*m;out[p+1]=data[p+1]*(1-m)+g/weight*m;out[p+2]=data[p+2]*(1-m)+b/weight*m;}
   }
   if((y&31)===0){onProgress(.15+.45*y/height);await tick();}
  }data=out;
 }
 onProgress(.6);
 if(sharp>0){
  const out=new Uint8ClampedArray(data);
  for(let y=0;y<height;y++){
   for(let x=0;x<width;x++){
    const p=(y*width+x)*4;if(data[p+3]<8)continue;
    let blur=0,weight=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const q=(clamp(y+dy,0,height-1)*width+clamp(x+dx,0,width-1))*4;
     if(Math.abs(data[q+3]-data[p+3])>16)continue;
     const w=(dx===0?2:1)*(dy===0?2:1);blur+=luma(data,q)*w;weight+=w;
    }
    const detail=luma(data,p)-blur/weight,delta=Math.abs(detail)<1.5?0:clamp(detail*sharp*1.8,-18,18);
    for(let c=0;c<3;c++)out[p+c]=data[p+c]+delta;
   }
   if((y&31)===0){onProgress(.6+.4*y/height);await tick();}
  }data=out;
 }
 onProgress(1);return data;
}
function lanczos(x){x=Math.abs(x);if(x<1e-8)return 1;if(x>=3)return 0;return 3*Math.sin(Math.PI*x)*Math.sin(Math.PI*x/3)/(Math.PI*Math.PI*x*x);}
function contributors(source,target){
 const scale=source/target,filter=Math.max(1,scale),radius=3*filter;
 return Array.from({length:target},(_,i)=>{
  const center=(i+.5)*scale-.5,map=new Map();
  for(let n=Math.ceil(center-radius);n<=Math.floor(center+radius);n++){const j=clamp(n,0,source-1),w=lanczos((center-n)/filter);map.set(j,(map.get(j)||0)+w);}
  const sum=[...map.values()].reduce((a,b)=>a+b,0);
  return[...map].map(([j,w])=>[j,w/sum]);
 });
}
/** Lanczos3 with premultiplied alpha and a bounded 32-row cache. */
export async function resizePixels(input,sw,sh,dw,dh,onProgress=()=>{},tick=noTick){
 validPixels(input,sw,sh);
 if(![dw,dh].every(n=>Number.isInteger(n)&&n>0)||dw*dh>LIMITS.outputPixels||Math.max(dw,dh)>LIMITS.edge)fail('OUTPUT_PIXELS');
 if(sw===dw&&sh===dh){onProgress(1);return input;}
 const xs=contributors(sw,dw),ys=contributors(sh,dh),output=new Uint8ClampedArray(dw*dh*4),rows=new Map();let computed=0;
 const getRow=async sy=>{
  if(rows.has(sy))return rows.get(sy);
  const row=new Float32Array(dw*4);
  for(let x=0;x<dw;x++){
   const p=x*4;let r=0,g=0,b=0,alpha=0;
   for(const[sx,w]of xs[x]){const q=(sy*sw+sx)*4,a=input[q+3]/255;r+=input[q]*a*w;g+=input[q+1]*a*w;b+=input[q+2]*a*w;alpha+=input[q+3]*w;}
   row[p]=r;row[p+1]=g;row[p+2]=b;row[p+3]=alpha;
  }
  if(rows.size>=32)rows.delete(rows.keys().next().value);rows.set(sy,row);
  if((++computed&15)===0)await tick();return row;
 };
 for(let y=0;y<dh;y++){
  const accum=new Float64Array(dw*4);
  for(const[sy,w]of ys[y]){const row=await getRow(sy);for(let p=0;p<row.length;p++)accum[p]+=row[p]*w;}
  for(let x=0;x<dw;x++){
   const p=(y*dw+x)*4,q=x*4,a=clamp(accum[q+3],0,255);output[p+3]=a;
   if(a>.5){output[p]=accum[q]*255/a;output[p+1]=accum[q+1]*255/a;output[p+2]=accum[q+2]*255/a;}
  }
  if((y&15)===0){onProgress(y/dh);await tick();}
 }
 onProgress(1);return output;
}
export function flattenPixels(input,color='#ffffff'){
 if(!/^#[0-9a-f]{6}$/i.test(color))fail('BACKGROUND');
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),out=new Uint8ClampedArray(input.length);
 for(let p=0;p<input.length;p+=4){const a=input[p+3]/255;for(let c=0;c<3;c++)out[p+c]=input[p+c]*a+rgb[c]*(1-a);out[p+3]=255;}return out;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^c>>>1:c>>>1;return c>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^crc>>>8;return(crc^0xffffffff)>>>0;}
export function uniqueNames(names){
 const used=new Set();return names.map(name=>{
  let candidate=name,count=1;const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  while(used.has(candidate.toLocaleLowerCase('en-US')))candidate=stem+'-'+(++count)+ext;
  used.add(candidate.toLocaleLowerCase('en-US'));return candidate;
 });
}
/** ZIP32 STORE: images are already compressed. UTF-8 filenames and CRC32. */
export async function zipImages(entries,tick=noTick){
 if(!entries.length||entries.length>LIMITS.files)fail('ARCHIVE');
 const names=uniqueNames(entries.map(e=>String(e.name).replace(/[\u0000-\u001f/\\]/g,'-').replace(/^\.+/,'')||'image.png'));
 const bodies=[],directories=[];let offset=0,total=0;
 for(let i=0;i<entries.length;i++){
  const body=new Uint8Array(await entries[i].blob.arrayBuffer());total+=body.length;if(total>LIMITS.outputBytes)fail('OUTPUT_MEMORY');
  const name=new TextEncoder().encode(names[i]),crc=crc32(body),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);
  h.setUint32(14,crc,true);h.setUint32(18,body.length,true);h.setUint32(22,body.length,true);h.setUint16(26,name.length,true);header.set(name,30);
  const dir=new Uint8Array(46+name.length),d=new DataView(dir.buffer);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);d.setUint16(14,33,true);
  d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);dir.set(name,46);
  bodies.push(header,body);directories.push(dir);offset+=header.length+body.length;await tick();
 }
 const dirSize=directories.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true);
 return new Blob([...bodies,...directories,end],{type:'application/zip'});
}
