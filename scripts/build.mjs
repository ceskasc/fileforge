import{mkdirSync,rmSync,cpSync,writeFileSync,readdirSync,statSync}from'node:fs';
import{join}from'node:path';import{execFileSync}from'node:child_process';
rmSync('public',{recursive:true,force:true});mkdirSync('public/assets',{recursive:true});
for(const path of['index.html','styles.css','404.html','robots.txt','sitemap.xml','LICENSE','assets','src'])cpSync(path,join('public',path),{recursive:true});
execFileSync('rsvg-convert',['assets/og-card.svg','-o','public/assets/og-card.png'],{stdio:'inherit'});
execFileSync('rsvg-convert',['assets/touch-icon.svg','-o','public/assets/apple-touch-icon.png'],{stdio:'inherit'});
writeFileSync('public/.nojekyll','');
for(const name of['models','vendor'])cpSync('.ai-cache/'+name,'public/'+name,{recursive:true});
cpSync('.ai-cache/ai-assets-manifest.json','public/ai-assets-manifest.json');
cpSync('THIRD_PARTY.md','public/THIRD_PARTY.md');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const paths=walk('public');
for(const p of ['public/assets/og-card.png','public/assets/apple-touch-icon.png'])if(statSync(p).size<100)throw new Error('Missing image: '+p);
const report={files:paths.length,bytes:paths.reduce((n,p)=>n+statSync(p).size,0),builtAt:new Date().toISOString(),runtimeDependencies:1,neuralModels:2};
writeFileSync('build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
