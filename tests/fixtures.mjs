export function pngHeader(w,h,animated=false){
 const a=new Uint8Array(33),v=new DataView(a.buffer);a.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);a.set([73,72,68,82],12);v.setUint32(16,w);v.setUint32(20,h);a[24]=8;a[25]=6;
 if(!animated)return a;const b=new Uint8Array(53);b.set(a);new DataView(b.buffer).setUint32(33,8);b.set([97,99,84,76],37);return b;
}
export function jpegHeader(w,h){return new Uint8Array([255,216,255,192,0,17,8,h>>8,h&255,w>>8,w&255,3,1,17,0,2,17,0,3,17,0,255,217]);}
export function webpHeader(w,h,animated=false){
 const a=new Uint8Array(30),v=new DataView(a.buffer);a.set([82,73,70,70]);v.setUint32(4,22,true);a.set([87,69,66,80,86,80,56,88],8);v.setUint32(16,10,true);a[20]=animated?2:0;
 for(let i=0;i<3;i++){a[24+i]=((w-1)>>(i*8))&255;a[27+i]=((h-1)>>(i*8))&255;}return a;
}
export function image(w,h,fn){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(fn(x,y),(y*w+x)*4);return a;}
