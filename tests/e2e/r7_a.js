'use strict';
const { launch, sleep } = require('./cdp5');
(async () => { const b = await launch(); const ev = b.ev;
 await b.viewport(1440, 900, false); await b.nav('/', 1500);
 await ev(`(()=>{const e=document.querySelector('#b-emi');e.value=e.min;e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(1000);
 console.log('MIN CTAs', await ev(`JSON.stringify([...document.querySelectorAll('#b-new,#b-used')].map(a=>({id:a.id,aria:a.getAttribute('aria-disabled'),href:a.getAttribute('href'),tab:a.tabIndex,dis:a.hasAttribute('disabled'),pe:getComputedStyle(a).pointerEvents,op:getComputedStyle(a).opacity,txt:a.textContent.trim()})))`));
 console.log('hint', await ev(`(document.querySelector('[data-budget]').parentElement.innerText.match(/[^\n]*(No cars|match|raise|increase)[^\n]*/gi)||[]).join(' | ')`));
 await ev(`(()=>{const e=document.querySelector('#b-emi');e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(800);
 console.log('MAX CTAs', await ev(`JSON.stringify([...document.querySelectorAll('#b-new,#b-used')].map(a=>({aria:a.getAttribute('aria-disabled'),op:getComputedStyle(a).opacity})))`));
 // R5-13 : what is it? print rail / photo stuff unknown; skip
 // Hindi prices
 await b.S('Network.setExtraHTTPHeaders',{headers:{}});
 for (const p of ['/?lang=hi','/hi/','/new-cars/model-h?lang=hi']) { await b.nav(p, 1200); console.log(p, await ev(`JSON.stringify({lang:document.documentElement.lang, lakh:(document.body.innerText.match(/[^\s]*\s?(लाख|करोड़|Lakh|Crore)/g)||[]).slice(0,8)})`)); }
 console.log('errors', JSON.stringify(b.errors)); b.close(); process.exit(0); })();
