'use strict';
// Round-6: Hindi finder + budget strings, focus-trap/keyboard checks for finder, filters sheet, lightbox, reserve sheet; 44px targets; reduced-motion
const { launch, sleep } = require('./cdp5');
(async () => { const b = await launch(); const ev = b.ev;
  const key = async (k, code, vk, mod = 0) => { await b.S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mod, text: k === 'Enter' ? '\r' : undefined }); await b.S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mod }); };
  await b.viewport(390, 844, true); await b.nav('/', 800); await ev(`document.cookie='lang=hi;path=/'`); await b.nav('/', 1500);
  await ev(`document.querySelector('[data-finder-open]').click()`); await sleep(500);
  for (let i = 0; i < 4; i++) { await ev(`(()=>{const s=document.querySelector('.fd-step:not([hidden])');const r=s.querySelector('input[type=radio]');if(r)r.click();document.querySelector('#finder [data-next]').click()})()`); await sleep(400); }
  await sleep(1500); console.log('HI finder results:', await ev(`document.querySelector('#fd-res')?.innerText.split(String.fromCharCode(10)).join(' | ')`)); await b.shot('hi_finder');
  console.log('HI finder latin words left', await ev(`(document.querySelector('#finder').innerText.match(/[A-Za-z]{4,}/g)||[]).slice(0,15)`));
  await ev(`document.querySelector('#finder').close()`);
  console.log('HI budget text', await ev(`document.querySelector('#budget')?.innerText.split(String.fromCharCode(10)).slice(0,14).join(' | ')`));
  // tab-trap in finder dialog
  await ev(`document.cookie='lang=en;path=/'`); await b.nav('/', 1200);
  await ev(`document.querySelector('[data-finder-open]').click()`); await sleep(400);
  const seen = new Set(); let escaped = false; for (let i = 0; i < 14; i++) { await key('Tab', 'Tab', 9); const inside = await ev(`document.querySelector('#finder').contains(document.activeElement)`); if (!inside) escaped = true; }
  console.log('finder dialog focus stays inside after 14 tabs', !escaped); await key('Escape', 'Escape', 27);
  // filters sheet on mobile
  await b.nav('/used-cars', 1200); const fb = await ev(`(()=>{const e=document.querySelector('[data-filters-open],[data-filter-open],.fbtn,#filters-open');return e?e.outerHTML.slice(0,120):null})()`); console.log('filters trigger', fb);
  if (fb) { await ev(`document.querySelector('[data-filters-open],[data-filter-open],.fbtn,#filters-open').click()`); await sleep(500); console.log('sheet role/aria-modal/focus', await ev(`(()=>{const s=document.querySelector('[role=dialog]:not([hidden]),dialog[open],.fsheet.open,.filters.open');return s?{role:s.getAttribute('role'),modal:s.getAttribute('aria-modal'),focusInside:s.contains(document.activeElement)}:'no sheet found'})()`)); let esc2 = false; for (let i = 0; i < 25; i++) { await key('Tab', 'Tab', 9); } console.log('active after 25 tabs', await ev(`document.activeElement.tagName+'.'+String(document.activeElement.className).slice(0,30)`)); await key('Escape', 'Escape', 27); await sleep(300); console.log('after Esc active', await ev(`document.activeElement.tagName+'.'+String(document.activeElement.className).slice(0,30)`)); }
  // lightbox on model page desktop
  await b.viewport(1440, 900, false); await b.nav('/new-cars/model-h', 1200);
  console.log('lightbox opener', await ev(`(()=>{const e=document.querySelector('[data-lb],[data-lightbox],.stage img');return e?e.outerHTML.slice(0,100)+' tab='+e.tabIndex:null})()`));
  await ev(`(document.querySelector('[data-lb],[data-lightbox],.stage button,.stage a')||document.querySelector('.stage img')).focus()`); await key('Enter', 'Enter', 13); await sleep(500);
  console.log('lightbox open?', await ev(`!!document.querySelector('.lb,.lightbox,[role=dialog][open],.lb-open')`), 'active', await ev(`document.activeElement.className`)); await key('Escape', 'Escape', 27); await sleep(300);
  // reserve sheet on used detail
  await b.nav('/used-cars/uc-1182-model-c-vx-2022', 1200);
  await ev(`[...document.querySelectorAll('a,button')].find(e=>/reserve/i.test(e.textContent)).focus()`); await key('Enter', 'Enter', 13); await sleep(600);
  console.log('reserve sheet', await ev(`(()=>{const a=document.activeElement;const d=a.closest('dialog,[role=dialog]');return {tag:a.tagName,id:a.id,inDialog:!!d,dialogOpen:d?d.open!==false:null,url:location.hash}})()`));
  await b.shot('reserve_d');
  console.log('errors', JSON.stringify(b.errors)); b.close(); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
