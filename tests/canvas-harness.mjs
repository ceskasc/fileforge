export function installCanvasHarness({width=2,height=1,pixels=null,maxReadPixels=Infinity,decodeFailure=false,fallbackFormat=false,drawFailure=null}={}){
  const names=['createImageBitmap','OffscreenCanvas','ImageData'],saved=Object.fromEntries(names.map(k=>[k,globalThis[k]]));
  const metrics={reads:[],writes:[],canvases:[],closed:0};
  const sourcePixels=pixels||((x,y)=>[80+x%80,90+y%70,120,255]);
  const pixel=(src,x,y)=>{
    x=Math.max(0,Math.min(src.width-1,Math.floor(x)));y=Math.max(0,Math.min(src.height-1,Math.floor(y)));
    if(src.closed)throw new DOMException('Decoded image was closed too early','InvalidStateError');
    return typeof src.pixels==='function'?src.pixels(x,y):[...src.pixels.slice((y*src.width+x)*4,(y*src.width+x)*4+4)];
  };
  class Canvas{
    constructor(w,h){this._width=w;this._height=h;this.pixels=null;this.background=[0,0,0,0];metrics.canvases.push(this);}
    get width(){return this._width;}set width(n){this._width=n;this.pixels=null;}
    get height(){return this._height;}set height(n){this._height=n;this.pixels=null;}
    materialize(){if(!this.pixels&&this.width*this.height<=1_000_000){this.pixels=new Uint8ClampedArray(this.width*this.height*4);for(let p=0;p<this.pixels.length;p+=4)this.pixels.set(this.background,p);}return this.pixels;}
    getContext(){
      const c=this;
      return{
        fillStyle:'#ffffff',
        fillRect(){const v=this.fillStyle.match(/[a-f0-9]{2}/gi).map(s=>parseInt(s,16));c.background=[...v,255];const a=c.materialize();if(a)for(let p=0;p<a.length;p+=4)a.set(c.background,p);},
        drawImage(src,...args){
          if(drawFailure)throw drawFailure;
          const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===8?args:args.length===4?[0,0,src.width,src.height,...args]:[0,0,src.width,src.height,args[0]||0,args[1]||0,src.width,src.height];
          const out=c.materialize();if(!out)return;
          for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
            const p=((dy+y)*c.width+dx+x)*4,s=pixel(src,sx+(x+.5)*sw/dw,sy+(y+.5)*sh/dh),a=s[3]/255,b=out[p+3]/255,alpha=a+b*(1-a);
            for(let k=0;k<3;k++)out[p+k]=alpha?(s[k]*a+out[p+k]*b*(1-a))/alpha:0;out[p+3]=alpha*255;
          }
        },
        getImageData(x,y,w,h){
          metrics.reads.push({width:w,height:h});
          if(w*h>maxReadPixels)throw new RangeError('Array buffer allocation failed');
          const out=new Uint8ClampedArray(w*h*4),input=c.materialize();
          for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(input){const q=((y+yy)*c.width+x+xx)*4;out.set(input.subarray(q,q+4),(yy*w+xx)*4);}
          return{data:out,width:w,height:h};
        },
        putImageData(image,x=0,y=0){
          metrics.writes.push({x,y,width:image.width,height:image.height});
          const out=c.materialize();if(!out)return;
          for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++){const p=((y+yy)*c.width+x+xx)*4,q=(yy*image.width+xx)*4;out.set(image.data.subarray(q,q+4),p);}
        }
      };
    }
    async convertToBlob({type,quality}){return new Blob([JSON.stringify({width:this.width,height:this.height,pixels:this.pixels?[...this.pixels]:[],quality})],{type:fallbackFormat?'image/png':type});}
  }
  globalThis.OffscreenCanvas=Canvas;
  globalThis.ImageData=class{constructor(data,w,h){this.data=data;this.width=w;this.height=h;}};
  globalThis.createImageBitmap=async()=>{if(decodeFailure)throw new Error('Unsupported image');return{width,height,pixels:sourcePixels,closed:false,close(){if(!this.closed){metrics.closed++;this.closed=true;}}};};
  return{metrics,restore(){for(const name of names)if(saved[name]===undefined)delete globalThis[name];else globalThis[name]=saved[name];}};
}
