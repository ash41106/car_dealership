'use strict';
const { launch, sleep } = require('./cdp5');
(async () => {
  const b = await launch(); await b.viewport(390, 844, true); await b.nav('/', 1500);
  console.log(JSON.stringify(await b.ev(`[...document.querySelectorAll('main > *')].map(e=>{const r=e.getBoundingClientRect();return e.tagName+'.'+String(e.className).split(' ')[0]+' top='+Math.round(r.top+scrollY)+' h='+Math.round(r.height)})`)));
  for (const y of [1700, 2500]) { await b.scroll(y); await sleep(1500); const f = await b.shot('void_' + y); console.log(f); console.log(JSON.stringify(await b.ev(`(()=>{const r=document.querySelector('#rail').getBoundingClientRect();return {railTop:r.top,railH:r.height,sy:scrollY}})()`))); }
  b.close(); process.exit(0);
})();
