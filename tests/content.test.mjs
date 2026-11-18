import test from'node:test';import assert from'node:assert/strict';import{readFileSync,existsSync}from'node:fs';import{messages}from'../src/i18n.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
test('every UI reference and accessible label points to an existing unique ID',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),'Missing UI ID '+m[1]);
 for(const m of html.matchAll(/(?:for|aria-controls|aria-labelledby)="([^"]+)"/g))for(const id of m[1].split(' '))assert.ok(ids.includes(id),'Missing reference '+id);
});
test('TR and EN cover every translated field and share interpolation variables',()=>{
 assert.deepEqual(Object.keys(messages.tr).sort(),Object.keys(messages.en).sort());
 for(const m of html.matchAll(/data-i18n(?:-label|-placeholder)?="([^"]+)"/g))assert.ok(messages.tr[m[1]],'Missing translation '+m[1]);
 for(const key of Object.keys(messages.tr)){
  const vars=s=>[...s.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
  assert.deepEqual(vars(messages.tr[key]),vars(messages.en[key]),key);
 }
});
test('the local runtime is self-hosted and uploads require the configured server method',()=>{
 assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(app));
 assert.match(app,/if\(isCloud\(settings\)\)\{\s*const \{enhanceInCloud\}/);
 assert.match(html,/<option id="cloudMethod" value="cloud" hidden disabled/);
 assert.match(html,/<meta name="fileforge-cloud-origin" content="">/);
 assert.ok(!html.includes('https://fonts.googleapis.com'));assert.ok(html.includes('Content-Security-Policy'));
 for(const m of html.matchAll(/(?:src|href)="\.\/([^"#]+)(?:#[^"]*)?"/g)){
  if(m[1].endsWith('.png'))continue;assert.ok(existsSync(new URL('../'+m[1],import.meta.url)),m[1]);
 }
});
