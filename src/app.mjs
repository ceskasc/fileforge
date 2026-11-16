import{ForgeError,LIMITS,inspectImage,targetDimensions,outputType,outputName,zipImages}from'./engine.mjs';
import{processImage}from'./process.mjs';
import{messages}from'./i18n.mjs';
const $=id=>document.getElementById(id),pause=()=>new Promise(r=>setTimeout(r,0));
let language='tr';try{language=localStorage.getItem('fileforge-language')==='en'?'en':'tr';}catch{}
const state={items:[],selected:null,mode:'convert',busy:false,adding:false,zipping:false,controller:null,counter:0,supported:new Set(['png','jpeg','webp']),feedback:null};
const t=(key,vars={})=>Object.entries(vars).reduce((s,[name,v])=>s.replaceAll('{'+name+'}',String(v)),messages[language][key]||messages.tr[key]||key);
const selected=()=>state.items.find(i=>i.id===state.selected);
const bytes=n=>n<1024?n+' B':new Intl.NumberFormat(language==='tr'?'tr-TR':'en-US',{maximumFractionDigits:n<1048576?0:2}).format(n/(n<1048576?1024:1048576))+(n<1048576?' KB':' MB');
const dims=(w,h)=>w+' × '+h+' px';
const icon=name=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS('http://www.w3.org/2000/svg','use');s.setAttribute('aria-hidden','true');u.setAttribute('href','./assets/icons.svg#'+name);s.append(u);return s;};
function notice(key,vars={},error=false){state.feedback={key,vars,error};$('feedback').textContent=t(key,vars);$('feedback').classList.toggle('error',error);}
const errorMessage=code=>t('error'+(code||'PROCESS'));
function readSettings(){return{mode:state.mode,format:$('format').value,quality:Number($('quality').value),width:$('width').value,height:$('height').value,lockAspect:$('lockAspect').checked,allowUpscale:$('allowUpscale').checked,scale:Number($('scale').value),sharpness:Number($('sharpness').value),denoise:Number($('denoise').value),contrast:$('contrast').checked,background:$('background').value};}
const settingsKey=()=>JSON.stringify(readSettings());
function release(item){URL.revokeObjectURL(item.url);if(item.outputUrl)URL.revokeObjectURL(item.outputUrl);}
function statusText(item){
 if(item.status==='processing')return t('processing')+' · '+Math.round((item.progress||0)*100)+'%';
 if(item.status==='error')return errorMessage(item.error);
 if(item.output&&item.signature!==settingsKey())return t('stale');
 return item.output?t('done')+' · '+bytes(item.output.blob.size):t('ready')+' · '+dims(item.meta.width,item.meta.height)+' · '+bytes(item.file.size);
}
function renderQueue(){
 const frag=document.createDocumentFragment();
 for(const item of state.items){
  const li=document.createElement('li');li.className='queue-item';
  const b=document.createElement('button');b.type='button';b.className='queue-select';b.setAttribute('aria-pressed',String(item.id===state.selected));b.setAttribute('aria-label',t('selectImage',{name:item.file.name}));
  const img=document.createElement('img');img.src=item.url;img.alt='';img.loading='lazy';img.width=img.height=42;
  const copy=document.createElement('span');copy.className='queue-copy';
  const name=document.createElement('span');name.className='queue-name';name.textContent=item.file.name;
  const status=document.createElement('span');status.className='queue-status';status.classList.toggle('error',item.status==='error');status.textContent=statusText(item);
  copy.append(name,status);b.append(img,copy);b.addEventListener('click',()=>{state.selected=item.id;render();});li.append(b);
  if(item.output){const a=document.createElement('a');a.className='icon-button';a.href=item.outputUrl;a.download=item.output.name;a.setAttribute('aria-label',t('downloadImage',{name:item.file.name}));a.append(icon('download'));li.append(a);}
  const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.disabled=state.busy||state.adding||state.zipping;remove.setAttribute('aria-label',t('removeImage',{name:item.file.name}));remove.append(icon('close'));
  remove.addEventListener('click',()=>{release(item);state.items=state.items.filter(i=>i.id!==item.id);if(state.selected===item.id)state.selected=state.items[0]?.id||null;notice('removed');render();});li.append(remove);frag.append(li);
 }
 $('queueList').replaceChildren(frag);$('queueCount').textContent=t('filesCount',{count:state.items.length});
}
function compare(){const value=Number($('compareSlider').value);$('afterLayer').style.clipPath='inset(0 '+(100-value)+'% 0 0)';$('compareLine').style.left=value+'%';}
function renderPreview(){
 const item=selected(),has=state.items.length>0;
 $('dropArea').hidden=has;$('loadedArea').hidden=!has;$('imageActions').hidden=!has;
 if(!item){$('beforeImage').removeAttribute('src');$('afterImage').removeAttribute('src');$('selectedDownload').removeAttribute('href');return;}
 $('previewName').textContent=item.file.name;
 if($('beforeImage').getAttribute('src')!==item.url)$('beforeImage').src=item.url;
 $('beforeImage').alt=t('sourceAlt',{name:item.file.name});
 const done=!!item.output;
 for(const id of['afterLayer','afterLabel','compareLine','compareControl','resultMeta','selectedDownload'])$(id).hidden=!done;
 $('compareHint').textContent=t(done?'compareHelp':'previewHelp');$('staleNotice').hidden=!done||item.signature===settingsKey();
 if(done){
  if($('afterImage').getAttribute('src')!==item.outputUrl)$('afterImage').src=item.outputUrl;
  $('afterImage').alt=t('resultAlt',{name:item.file.name});$('selectedDownload').href=item.outputUrl;$('selectedDownload').download=item.output.name;
  $('originalMeta').textContent=bytes(item.file.size)+' · '+dims(item.meta.width,item.meta.height);$('outputMeta').textContent=bytes(item.output.blob.size)+' · '+dims(item.output.width,item.output.height);
  const ratio=(item.output.blob.size-item.file.size)/item.file.size,value=Math.round(Math.abs(ratio)*100);
  $('savings').textContent=value===0?t('sameSize'):t(ratio>0?'larger':'smaller',{value});$('savings').classList.toggle('larger',ratio>0);
 }else{$('afterImage').removeAttribute('src');$('selectedDownload').removeAttribute('href');}
 compare();
}
function updateControls(){
 const s=readSettings(),item=selected(),locked=state.busy||state.adding||state.zipping;
 $('settingsFields').disabled=locked;$('resizeFields').hidden=state.mode!=='resize';$('enhanceFields').hidden=state.mode!=='enhance';$('modeHint').textContent=t(state.mode+'Hint');
 const type=outputType(s.format,item?.meta.type||'image/jpeg');
 $('formatHint').textContent=t(type==='image/png'?'pngHint':type==='image/jpeg'?'jpegHint':'webpHint');
 const pngOnly=s.format==='png'||(s.format==='original'&&state.items.length>0&&state.items.every(i=>i.meta.type==='image/png'));
 $('quality').disabled=pngOnly||locked;document.querySelector('.quality-field').hidden=pngOnly;
 $('backgroundField').hidden=type!=='image/jpeg'&&!(s.format==='original'&&state.items.some(i=>i.meta.type==='image/jpeg'));
 for(const id of['quality','sharpness','denoise'])$(id+'Value').textContent=$(id).value+'%';$('backgroundValue').textContent=s.background.toUpperCase();
 let valid=true;$('targetSize').classList.remove('error');
 if(!item)$('targetSize').textContent=t('targetEmpty');
 else{try{const d=targetDimensions(item.meta.width,item.meta.height,s);$('targetSize').textContent=dims(d.width,d.height);}catch(e){valid=false;$('targetSize').textContent=errorMessage(e.code);$('targetSize').classList.add('error');}}
 $('processButton').disabled=locked||!state.items.length||!valid;$('processButton').setAttribute('aria-busy',String(state.busy));$('processLabel').textContent=t(state.busy?'processing':state.items.some(i=>i.output)?'retry':'process');
 $('cancelButton').hidden=!state.busy;$('cancelButton').disabled=!!state.controller?.signal.aborted;
 for(const id of['chooseButton','addButton','clearButton','fileInput'])$(id).disabled=locked;
 document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===state.mode;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;b.disabled=locked;});
 $('toolPanel').setAttribute('aria-labelledby','tab-'+state.mode);
 $('zipButton').hidden=state.items.filter(i=>i.output).length<2;$('zipButton').disabled=locked;$('zipLabel').textContent=t(state.zipping?'zipPreparing':'zip');
 document.querySelectorAll('[data-strength]').forEach(b=>{const a=({gentle:[30,20],balanced:[55,40],strong:[80,65]})[b.dataset.strength];b.setAttribute('aria-pressed',String(Number($('sharpness').value)===a[0]&&Number($('denoise').value)===a[1]));});
}
function render(){renderQueue();renderPreview();updateControls();}
function translate(){
 document.documentElement.lang=language;document.title=t('pageTitle');
 document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});
 document.querySelectorAll('[data-i18n-label]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.i18nLabel)));
 document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>{e.placeholder=t(e.dataset.i18nPlaceholder);});
 $('languageButton').textContent=language==='tr'?'EN':'TR';$('languageButton').setAttribute('aria-label',t('language'));
 if(state.feedback)notice(state.feedback.key,state.feedback.vars,state.feedback.error);render();
}
function chooseMode(mode){
 if(state.busy||state.adding||state.zipping)return;
 state.mode=mode;$('format').value=mode==='resize'||mode==='enhance'?'original':state.supported.has('webp')?'webp':state.supported.has('jpeg')?'jpeg':'png';
 $('quality').value=({convert:86,compress:72,resize:90,enhance:95})[mode];$('compareSlider').value='50';render();
}
async function addFiles(files){
 if(state.busy||state.adding||state.zipping||!files.length)return;
 state.adding=true;updateControls();const errors=[];let count=0,total=state.items.reduce((n,i)=>n+i.file.size,0);
 for(const file of files){
  if(state.items.length>=LIMITS.files){errors.push(t('errorQUEUE_FULL'));break;}
  if(file.size>LIMITS.fileBytes){errors.push(file.name+': '+t('errorFILE_SIZE'));continue;}
  if(total+file.size>LIMITS.queueBytes){errors.push(file.name+': '+t('errorQUEUE_SIZE'));continue;}
  try{
   const meta=inspectImage(await file.arrayBuffer()),id='image-'+(++state.counter);
   state.items.push({id,file,meta,url:URL.createObjectURL(file),status:'ready',output:null,outputUrl:null,signature:null});total+=file.size;count++;if(!state.selected)state.selected=id;
  }catch(e){errors.push(file.name+': '+errorMessage(e.code));}
 }
 state.adding=false;$('fileInput').value='';
 if(errors.length){state.feedback=null;$('feedback').textContent=(count?t('added',{count})+'\n':'')+errors.slice(0,3).join('\n');$('feedback').classList.add('error');}else notice('added',{count});render();
}
async function workerProcess(file,settings,signal,onProgress){
 if(!('Worker'in window)||!('OffscreenCanvas'in window)||typeof createImageBitmap!=='function')return processImage(file,settings,{signal,onProgress});
 let worker;try{worker=new Worker(new URL('./image-worker.mjs',import.meta.url),{type:'module'});}catch{return processImage(file,settings,{signal,onProgress});}
 try{return await new Promise((resolve,reject)=>{
  let timer;const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();worker.terminate();reject(new DOMException('Aborted','AbortError'));};
  const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>{cleanup();worker.terminate();reject(new ForgeError('PROCESS'));},120000);};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  worker.onmessage=({data})=>{watchdog();if(data.kind==='progress')onProgress(data);else if(data.kind==='done'){cleanup();resolve(data.result);}else if(data.kind==='error'){cleanup();reject(new ForgeError(data.code));}};
  worker.onerror=event=>{event.preventDefault();cleanup();const e=new ForgeError('CANVAS');e.workerFailure=true;reject(e);};watchdog();worker.postMessage({file,settings});
 });}catch(e){if(e.workerFailure||e.code==='CANVAS'||e.code==='DECODE'){worker.terminate();return processImage(file,settings,{signal,onProgress});}throw e;}finally{worker.terminate();}
}
async function processAll(event){
 event.preventDefault();if(state.busy||state.adding||state.zipping||!state.items.length)return;if(!$('processingForm').reportValidity())return;
 const settings=readSettings(),signature=JSON.stringify(settings);state.controller=new AbortController();const signal=state.controller.signal;
 state.busy=true;$('progressArea').hidden=false;notice('processing');render();let completed=0,failures=0;
 for(let index=0;index<state.items.length;index++){
  if(signal.aborted)break;const item=state.items[index];item.status='processing';item.progress=0;item.error=null;renderQueue();let previous=-1;
  try{
   const output=await workerProcess(item.file,settings,signal,p=>{
    if(signal.aborted)return;item.progress=p.value;const whole=(index+p.value)/state.items.length;
    $('progressBar').value=whole;$('progressPercent').textContent=Math.round(whole*100)+'%';$('progressText').textContent=(index+1)+'/'+state.items.length+' · '+t('stage'+p.stage[0].toUpperCase()+p.stage.slice(1));
    const step=Math.floor(p.value*10);if(step!==previous){previous=step;renderQueue();}
   });
   const retained=state.items.reduce((n,other)=>n+(other.id!==item.id?other.output?.blob.size||0:0),0);if(retained+output.blob.size>LIMITS.outputBytes)throw new ForgeError('OUTPUT_MEMORY');
   if(item.outputUrl)URL.revokeObjectURL(item.outputUrl);output.name=outputName(item.file.name,output.type,settings.mode);
   item.output=output;item.outputUrl=URL.createObjectURL(output.blob);item.signature=signature;item.meta.width=output.sourceWidth;item.meta.height=output.sourceHeight;item.status='done';completed++;
  }catch(e){if(e.name==='AbortError'){item.status=item.output?'done':'ready';break;}item.status='error';item.error=e.code||'PROCESS';failures++;}
  renderQueue();renderPreview();await pause();
 }
 const cancelled=signal.aborted;state.busy=false;state.controller=null;$('progressArea').hidden=true;
 if(cancelled)notice('cancelled');else if(failures){state.feedback=null;$('feedback').textContent=(completed?t('finished',{count:completed})+' ':'')+state.items.filter(i=>i.status==='error').map(i=>i.file.name+': '+errorMessage(i.error)).slice(0,2).join('\n');$('feedback').classList.add('error');}else notice('finished',{count:completed});render();
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function downloadZip(){
 if(state.busy||state.adding||state.zipping)return;
 const entries=state.items.filter(i=>i.output).map(i=>({name:i.output.name,blob:i.output.blob}));if(entries.length<2)return;
 state.zipping=true;updateControls();renderQueue();
 try{downloadBlob(await zipImages(entries,pause),'fileforge-images.zip');}catch(e){notice('error'+(e.code||'ARCHIVE'),{},true);}finally{state.zipping=false;updateControls();renderQueue();}
}
$('beforeImage').addEventListener('load',()=>{const item=selected(),img=$('beforeImage');if(item&&img.getAttribute('src')===item.url&&img.naturalWidth&&(item.meta.width!==img.naturalWidth||item.meta.height!==img.naturalHeight)){item.meta.width=img.naturalWidth;item.meta.height=img.naturalHeight;updateControls();renderQueue();}});
$('beforeImage').addEventListener('error',()=>{if(selected())notice('errorDECODE',{},true);});
$('chooseButton').addEventListener('click',()=>$('fileInput').click());$('addButton').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',e=>addFiles([...e.target.files]));
$('clearButton').addEventListener('click',()=>{if(state.busy||state.adding||state.zipping)return;state.items.forEach(release);state.items=[];state.selected=null;notice('cleared');render();});
$('processingForm').addEventListener('submit',processAll);$('cancelButton').addEventListener('click',()=>{state.controller?.abort();updateControls();});
$('zipButton').addEventListener('click',downloadZip);$('compareSlider').addEventListener('input',compare);
for(const event of['input','change'])$('settingsFields').addEventListener(event,()=>{updateControls();renderQueue();renderPreview();});
document.querySelectorAll('[data-mode]').forEach((b,index,all)=>{
 b.addEventListener('click',()=>chooseMode(b.dataset.mode));
 b.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?all.length-1:(index+(e.key==='ArrowRight'?1:-1)+all.length)%all.length;if(!all[next].disabled){chooseMode(all[next].dataset.mode);all[next].focus();}});
});
document.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{const v=Number(b.dataset.size);$('width').value=v||'';$('height').value=v||'';$('lockAspect').checked=true;updateControls();renderQueue();renderPreview();}));
document.querySelectorAll('[data-strength]').forEach(b=>b.addEventListener('click',()=>{const v=({gentle:[30,20],balanced:[55,40],strong:[80,65]})[b.dataset.strength];$('sharpness').value=v[0];$('denoise').value=v[1];updateControls();renderQueue();renderPreview();}));
$('themeButton').addEventListener('click',()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=value;document.querySelector('meta[name="theme-color"]').content=value==='dark'?'#10141e':'#f7f6f2';try{localStorage.setItem('fileforge-theme',value);}catch{}});
$('languageButton').addEventListener('click',()=>{language=language==='tr'?'en':'tr';try{localStorage.setItem('fileforge-language',language);}catch{}translate();});
$('privacyButton').addEventListener('click',()=>{if($('privacyDialog').showModal)$('privacyDialog').showModal();else{document.querySelector('.notes-list details').open=true;document.querySelector('.notes').scrollIntoView();}});
$('closePrivacy').addEventListener('click',()=>$('privacyDialog').close());
$('privacyDialog').addEventListener('click',e=>{if(e.target===$('privacyDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
let dragDepth=0;
document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});
document.addEventListener('drop',e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();dragDepth=0;$('dropArea').classList.remove('dragging');$('dropTitle').textContent=t('dropTitle');addFiles([...e.dataTransfer.files]);});
$('workspace').addEventListener('dragenter',e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();dragDepth++;$('dropArea').classList.add('dragging');$('dropTitle').textContent=t('dropActive');});
$('workspace').addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('dropArea').classList.remove('dragging');$('dropTitle').textContent=t('dropTitle');}});
window.addEventListener('pagehide',e=>{if(!e.persisted){state.controller?.abort();state.items.forEach(release);}});
translate();document.querySelector('meta[name="theme-color"]').content=document.documentElement.dataset.theme==='dark'?'#10141e':'#f7f6f2';
(async()=>{
 const c=document.createElement('canvas');c.width=c.height=2;if(!c.getContext('2d')){notice('errorCANVAS',{},true);return;}
 for(const[format,mime]of[['webp','image/webp'],['jpeg','image/jpeg']]){
  const ok=await new Promise(r=>c.toBlob(b=>r(b?.type===mime),mime,.8));
  if(!ok){state.supported.delete(format);$('format').querySelector('option[value="'+format+'"]').disabled=true;if($('format').value===format)$('format').value=state.supported.has('jpeg')?'jpeg':'png';}
 }c.width=c.height=1;updateControls();
})();
