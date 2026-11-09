const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch();const ev=b.ev;
const key=async(k,code,vk,mod=0)=>{await b.S('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk,modifiers:mod});await b.S('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk,modifiers:mod});await sleep(60)};
await b.viewport(390,844,true);await b.nav('/used-cars',1200);
await ev(`document.querySelector('[data-filters]').focus()`);await ev(`document.querySelector('[data-filters]').click()`);await sleep(600);
console.log('expanded',await ev(`document.querySelector('[data-filters]').getAttribute('aria-expanded')`));
const inside=`(()=>{const a=document.activeElement;const s=document.querySelector('.side');return {tag:a.tagName,inSide:!!(s&&s.contains(a)),role:s&&s.getAttribute('role'),modal:s&&s.getAttribute('aria-modal')}})()`;
let out=[];for(let i=0;i<20;i++){await key('Tab','Tab',9);out.push(await ev(inside+'.inSide'))}
console.log('tab x20 inside',out.every(Boolean));out=[];for(let i=0;i<6;i++){await key('Tab','Tab',9,8);out.push(await ev(inside+'.inSide'))}
console.log('shift-tab inside',out.every(Boolean));
await key('Escape','Escape',27);await sleep(400);console.log('after esc',await ev(`JSON.stringify({exp:document.querySelector('[data-filters]').getAttribute('aria-expanded'),focus:document.activeElement.getAttribute('data-filters')!==null})`));
// first visit typography: cache off, fresh load, sample fonts status & CLS
await b.S('Network.setCacheDisabled',{cacheDisabled:true});await b.S('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:90000});
await b.S('Page.addScriptToEvaluateOnNewDocument',{source:`window.__ls=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__ls.push([Math.round(e.startTime),+e.value.toFixed(4),(e.sources||[]).map(s=>s.node&&s.node.nodeName+'.'+(s.node.className||'')).join(',')])}).observe({type:'layout-shift',buffered:true})`});
for(const [w,h,m] of [[390,844,true],[1440,900,false]]){await b.viewport(w,h,m);await b.nav('/',100);
 await sleep(150);await b.shot('fout_'+w+'_a');await sleep(900);await b.shot('fout_'+w+'_b');await sleep(2500);
 console.log(w,'fonts',await ev(`JSON.stringify([...document.fonts].map(f=>f.family+' '+f.style+' '+f.status))`),'shifts',await ev(`JSON.stringify(window.__ls)`));}
b.close();process.exit(0)})();
