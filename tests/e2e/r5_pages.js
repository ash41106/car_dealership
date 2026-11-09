const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
await b.S('Page.addScriptToEvaluateOnNewDocument',{source:`window.__cls=0;window.__lcp=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}`});
const pages=['/','/new-cars','/new-cars/model-h','/new-cars/model-s','/used-cars','/used-cars/uc-1182-model-c-vx-2022','/test-drive','/service','/compare?ids=model-h,model-c','/emi','/contact','/credits','/account','/sell','/privacy'];
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) { await b.viewport(w,h,m);
 for (const p of pages) { await b.nav(p,1200);
  const total=await ev('document.documentElement.scrollHeight'); for(let y=0;y<total;y+=h*0.8){await ev(`scrollTo(0,${y})`);await sleep(150)} await sleep(600);
  const r=await ev(`(()=>{const de=document.documentElement;
   const hid=[...document.querySelectorAll('main *, section *')].filter(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return r.height>20&&r.width>20&&c.opacity==='0'&&c.display!=='none'&&c.visibility!=='hidden'&&!e.closest('[hidden],dialog,.h3-slide,.cur-r,.cur-d,.xf')&&!['INPUT'].includes(e.tagName)&&!e.matches('.qs,.sw')}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,30));
   const rv=[...document.querySelectorAll('.reveal:not(.in):not(.on):not(.vis)')].length;
   const small=[...document.querySelectorAll('a,button,select,textarea,input:not([type=hidden]):not([type=range])')].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&(r.height<44||r.width<44)&&c.visibility!=='hidden'&&!e.closest('[hidden]')&&!(e.type==='radio'||e.type==='checkbox')}).map(e=>(e.tagName+'.'+String(e.className).slice(0,20)+'['+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)+']'));
   return JSON.stringify({sw:de.scrollWidth,iw:innerWidth,cls:+window.__cls.toFixed(4),lcp:Math.round(window.__lcp),hid,rv,smallN:small.length,small:small.slice(0,4)})})()`);
  console.log(w,p,r,b.errors.length?JSON.stringify(b.errors):'');
 }}
console.log('fonts',await ev(`JSON.stringify([...document.fonts].map(f=>f.family+' '+f.weight+' '+f.status))`));
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
