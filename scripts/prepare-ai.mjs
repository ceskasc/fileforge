import{mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{basename,join}from'node:path';
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
if(!runtime||!license)throw new Error('TensorFlow runtime or licence missing');
execFileSync('tar',['-xzf',root+'/tensorflow.tgz','-C',root,runtime,license]);
copyFileSync(root+'/'+runtime,root+'/vendor/tf.min.js');copyFileSync(root+'/'+runtime,root+'/runtime/tf.cjs');copyFileSync(root+'/'+license,root+'/vendor/tensorflow-LICENSE.txt');
const modelLicense=await download('https://raw.githubusercontent.com/thekevinscott/UpscalerJS/'+config.revision+'/LICENSE');
writeFileSync(root+'/models/LICENSE.txt',modelLicense);
records.push({path:'vendor/tf.min.js',sha256:createHash('sha256').update(readFileSync(root+'/vendor/tf.min.js')).digest('hex'),bytes:readFileSync(root+'/vendor/tf.min.js').length});
writeFileSync(root+'/ai-assets-manifest.json',JSON.stringify({tensorflow:config.tensorflowVersion,packageIntegrity:actual,modelRevision:config.revision,assets:records},null,2));
console.log(JSON.stringify({neuralModels:2,verifiedModelFiles:config.files.length,totalModelBytes:records.filter(r=>r.path.startsWith('models/')).reduce((n,r)=>n+r.bytes,0),tensorflow:config.tensorflowVersion,runtimeSelfHosted:true}));
