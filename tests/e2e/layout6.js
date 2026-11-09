'use strict';
// Round-6: per-section layout cost (forced relayout of each subtree) at mobile with 4x CPU. node layout6.js [path] [w]
const { launch, sleep } = require('./cdp5');
(async () => {
  const p = process.argv[2] || '/', w = +process.argv[3] || 390; const b = await launch(); await b.viewport(w, 844, w < 600); await b.nav(p, 3000);
  await b.S('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await b.ev(`(()=>{const out=[];const kids=[...document.querySelectorAll('header, main > *, footer')];
    for(const k of kids){const t=[];for(let i=0;i<5;i++){k.style.paddingRight=(i%2?'1px':'2px');const a=performance.now();void document.body.offsetHeight;t.push(performance.now()-a)}k.style.paddingRight='';
      out.push({sel:k.tagName+'.'+String(k.className).split(' ')[0]+(k.id?'#'+k.id:''),n:k.querySelectorAll('*').length,ms:Math.round(Math.min(...t))});}
    return out})()`);
  r.sort((a, b) => b.ms - a.ms).forEach(x => console.log(x.ms + ' ms', x.n, 'elements', x.sel)); b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
