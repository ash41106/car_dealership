'use strict';
// Scroll-through screenshots: node scroll5.js <path> <w> <h> <tag> [stepFraction]
const { launch, sleep } = require('./cdp5');
(async () => {
  const [p, w, h, tag, frac] = [(process.argv[2]||'').replace(/^[A-Za-z]:.*Git/,'')||'/', +process.argv[3] || 1440, +process.argv[4] || 900, process.argv[5] || 'x', +process.argv[6] || 0.9];
  const b = await launch(); await b.viewport(w, h, w < 600); await b.nav(p, 1500);
  const total = await b.ev('document.documentElement.scrollHeight'); console.log('scrollHeight', total);
  let i = 0; for (let y = 0; y < total && i < 40; y += Math.round(h * frac), i++) { await b.scroll(y); const f = await b.shot(`${tag}_${String(i).padStart(2, '0')}`); const sy = await b.ev('scrollY'); console.log(i, 'y=' + sy, f); }
  console.log('final scrollHeight', await b.ev('document.documentElement.scrollHeight'), 'errors', JSON.stringify(b.errors));
  console.log('counters', JSON.stringify(await b.ev(`[...document.querySelectorAll('[data-count],[data-counter],.counter,.trust-num,.trust *')].filter(e=>/\d/.test(e.textContent)&&e.children.length===0).slice(0,12).map(e=>e.textContent.trim())`)));
  console.log('hidden', JSON.stringify(await b.ev(`[...document.querySelectorAll('body *')].filter(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();return r.height>20&&c.opacity==='0'&&c.display!=='none'&&c.visibility!=='hidden'}).slice(0,15).map(e=>e.tagName+'.'+String(e.className).slice(0,40))`)));
  b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
