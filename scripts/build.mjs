import{mkdirSync,rmSync,cpSync,writeFileSync,readdirSync,statSync,readFileSync,existsSync}from'node:fs';
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
const version=JSON.parse(readFileSync('package.json','utf8')).version,tag=encodeURIComponent(version);
for(const file of walk('public/src').filter(p=>/\.m?js$/.test(p))){
 const source=readFileSync(file,'utf8').replace(/(['"])(\.\.?\/[^'"]+\.m?js)\1/g,(_,quote,path)=>quote+path+'?v='+tag+quote);
 writeFileSync(file,source);
 execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
const page=readFileSync('public/index.html','utf8').replace(/((?:src|href)="[^"]+\.(?:css|m?js))"/g,(_,prefix)=>prefix+'?v='+tag+'"');
writeFileSync('public/index.html',page);
for(const match of page.matchAll(/(?:src|href)="\.\/([^"]*)"/g)){
 const path=match[1].split(/[?#]/)[0];
 if(!existsSync(join('public',path)))throw new Error('Missing published resource: '+path);
}
const paths=walk('public');
for(const p of ['public/assets/og-card.png','public/assets/apple-touch-icon.png'])if(statSync(p).size<100)throw new Error('Missing image: '+p);
const report={files:paths.length,bytes:paths.reduce((n,p)=>n+statSync(p).size,0),builtAt:new Date().toISOString(),runtimeDependencies:2,neuralModels:3};
writeFileSync('build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
