import{processImage}from'./process.mjs';
self.addEventListener('message',async({data})=>{
 try{const result=await processImage(data.file,data.settings,{onProgress:p=>self.postMessage({kind:'progress',...p})});self.postMessage({kind:'done',result});}
 catch(e){self.postMessage({kind:'error',code:e.code||'PROCESS'});}
});