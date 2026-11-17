import{mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{basename,join}from'node:path';
import{makeCspCompatibleRuntime}from'./csp-runtime.mjs';
import{prepareRestorationModel}from'./restore-model.mjs';
const config=JSON.parse(readFileSync('scripts/ai-assets.json','utf8')),root='.ai-cache',records=[];
mkdirSync(root+'/models',{recursive:true});mkdirSync(root+'/vendor',{recursive:true});mkdirSync(root+'/runtime',{recursive:true});
async function download(url){
 for(let attempt=0;attempt<3;attempt++){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('HTTP '+response.status+' '+url);return Buffer.from(await response.arrayBuffer());}
  catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,1000));}
 }
}
for(const[variant,path,sha]of config.files){
 const dest=join(root,'models',variant,basename(path));mkdirSync(join(root,'models',variant),{recursive:true});
 let data=existsSync(dest)?readFileSync(dest):await download('https://raw.githubusercontent.com/thekevinscott/UpscalerJS/'+config.revision+'/'+path);
 const actual=createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
 if(actual!==sha)throw new Error('Model integrity check failed: '+path);
 writeFileSync(dest,data);records.push({path:'models/'+variant+'/'+basename(path),sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
}
const metadata=JSON.parse((await download('https://registry.npmjs.org/@tensorflow%2Ftfjs/'+config.tensorflowVersion)).toString());
if(metadata.version!==config.tensorflowVersion||!metadata.dist.integrity?.startsWith('sha512-'))throw new Error('Unexpected TensorFlow package metadata');
const archive=await download(metadata.dist.tarball),actual='sha512-'+createHash('sha512').update(archive).digest('base64');
if(actual!==metadata.dist.integrity)throw new Error('TensorFlow package integrity failed');
writeFileSync(root+'/tensorflow.tgz',archive);
const list=execFileSync('tar',['-tzf',root+'/tensorflow.tgz'],{encoding:'utf8'}).trim().split('\n');
const runtime=list.find(p=>p==='package/dist/tf.min.js'),license=list.find(p=>/^package\/LICENSE(?:\.txt)?$/i.test(p));
if(!runtime)throw new Error('TensorFlow runtime missing: '+list.filter(p=>/tf.*min|license/i.test(p)).join(', '));
execFileSync('tar',['-xzf',root+'/tensorflow.tgz','-C',root,runtime,...(license?[license]:[])]);
const upstreamRuntime=readFileSync(root+'/'+runtime),servedRuntime=makeCspCompatibleRuntime(upstreamRuntime.toString('utf8'));
writeFileSync(root+'/vendor/tf.min.js',servedRuntime);writeFileSync(root+'/runtime/tf.cjs',servedRuntime);if(license)copyFileSync(root+'/'+license,root+'/vendor/tensorflow-LICENSE.txt');else writeFileSync(root+'/vendor/tensorflow-LICENSE.txt',await download('https://raw.githubusercontent.com/tensorflow/tfjs/tfjs-v4.22.0/LICENSE'));
const wasmArchive=await download('https://registry.npmjs.org/@tensorflow/tfjs-backend-wasm/-/tfjs-backend-wasm-'+config.tensorflowVersion+'.tgz');
const wasmIntegrity='sha512-'+createHash('sha512').update(wasmArchive).digest('base64');
if(wasmIntegrity!==config.wasmIntegrity)throw new Error('WASM accelerator package integrity failed');
writeFileSync(root+'/wasm.tgz',wasmArchive);
const wasmFiles=['tf-backend-wasm.min.js','tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'];
const wasmRoot=root+'/wasm-package';mkdirSync(wasmRoot,{recursive:true});
execFileSync('tar',['-xzf',root+'/wasm.tgz','-C',wasmRoot,...wasmFiles.map(name=>'package/dist/'+name)]);
for(const name of wasmFiles){
 const data=readFileSync(wasmRoot+'/package/dist/'+name);
 writeFileSync(root+'/vendor/'+name,data);
 records.push({path:'vendor/'+name,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
}
const modelLicense=await download('https://raw.githubusercontent.com/thekevinscott/UpscalerJS/'+config.revision+'/LICENSE');
writeFileSync(root+'/models/LICENSE.txt',modelLicense);
const checkpointPath=root+'/realesr-general-x4v3.pth';
const checkpoint=existsSync(checkpointPath)?readFileSync(checkpointPath):await download(config.restoration.url);
if(createHash('sha256').update(checkpoint).digest('hex')!==config.restoration.sha256)throw new Error('Restoration checkpoint integrity failed');
writeFileSync(checkpointPath,checkpoint);
execFileSync('python3',['scripts/convert-restoration.py',checkpointPath,root+'/runtime/srvgg-weights',config.restoration.sha256],{stdio:'inherit'});
records.push(...await prepareRestorationModel(root));
writeFileSync(root+'/models/restore/LICENSE.txt',await download('https://raw.githubusercontent.com/xinntao/Real-ESRGAN/'+config.restoration.revision+'/LICENSE'));
records.push({path:'vendor/tf.min.js',sha256:createHash('sha256').update(readFileSync(root+'/vendor/tf.min.js')).digest('hex'),bytes:readFileSync(root+'/vendor/tf.min.js').length});
writeFileSync(root+'/ai-assets-manifest.json',JSON.stringify({tensorflow:config.tensorflowVersion,packageIntegrity:actual,wasmPackageIntegrity:wasmIntegrity,modelRevision:config.revision,restoration:{...config.restoration,conversion:'fileforge-srvgg-v1'},runtimeCompatibility:'fileforge-csp-v1',upstreamRuntimeSha256:createHash('sha256').update(upstreamRuntime).digest('hex'),assets:records},null,2));
console.log(JSON.stringify({neuralModels:3,verifiedModelFiles:config.files.length,totalModelBytes:records.filter(r=>r.path.startsWith('models/')).reduce((n,r)=>n+r.bytes,0),tensorflow:config.tensorflowVersion,runtimeSelfHosted:true,wasmSelfHosted:true}));
