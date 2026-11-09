const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
const fn=`(()=>{
const parse=s=>{const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const L=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
const bgOf=e=>{let cols=[];while(e){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){cols.push(c);if(c.a>=.99)break}e=e.parentElement}let base={r:255,g:255,b:255};for(let i=cols.length-1;i>=0;i--){const c=cols[i];base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)}}return base};
const out=[];const seen=new Set();
for(const e of document.querySelectorAll('main *,footer *,header *')){ if(e.children.length>0&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue; const t=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim(); if(!t)continue; const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); if(r.width<2||r.height<2||cs.visibility==='hidden'||e.closest('[hidden]'))continue;
 let col=parse(cs.color);const op=parseFloat(cs.opacity);const bg=bgOf(e); col={r:col.r*col.a+bg.r*(1-col.a),g:col.g*col.a+bg.g*(1-col.a),b:col.b*col.a+bg.b*(1-col.a)};
 const a=L(col),b2=L(bg);const cr=(Math.max(a,b2)+.05)/(Math.min(a,b2)+.05);const fs=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight)>=700;const need=(fs>=24||(fs>=18.66&&bold))?3:4.5;
 if(cr<need){const k=e.className+t.slice(0,20);if(seen.has(k))continue;seen.add(k);out.push([Math.round(cr*100)/100,need,e.tagName+'.'+String(e.className).slice(0,25),t.slice(0,30),cs.color,Math.round(fs)])}}
return JSON.stringify(out.slice(0,25))})()`;
for(const p of ['/','/new-cars','/new-cars/model-h','/used-cars/uc-1182-model-c-vx-2022','/test-drive']){ for(const [w,h,m] of [[1440,900,false]]){ await b.viewport(w,h,m); await b.nav(p,1500); const tot=await ev('document.documentElement.scrollHeight'); for(let y=0;y<tot;y+=700){await ev(`scrollTo(0,${y})`);await sleep(120)} await sleep(800);
 console.log(p, await ev(fn));}}
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
