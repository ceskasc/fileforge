import{readdirSync,readFileSync}from'node:fs';import{join}from'node:path';import{execFileSync}from'node:child_process';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const paths=[...walk('src'),...walk('scripts'),...walk('tests')].filter(p=>/\.m?js$/.test(p));
for(const path of paths)execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
execFileSync('python3',['scripts/check_html.py'],{stdio:'inherit'});
const css=readFileSync('styles.css','utf8');
if(!css.includes('@media(max-width:760px)')||!css.includes('minmax(0,1fr)')||!css.includes(':focus-visible'))throw new Error('Responsive/accessibility contract missing');
console.log('Syntax checked:',paths.length,'JavaScript modules. Responsive and HTML contracts passed.');
