const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
// reduced motion
await b.S('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
for(const [w,h,m] of [[1440,900,false],[390,844,true]]){ await b.viewport(w,h,m); await b.nav('/',1500);
 const tot=await ev('document.documentElement.scrollHeight'); let i=0; for(let y=0;y<tot;y+=h*.85,i++){await ev(`scrollTo(0,${y})`);await sleep(250); if(i%3==0) await b.shot(`rm_${w}_${i}`)}
 console.log('RM',w,await ev(`JSON.stringify({sw:document.documentElement.scrollWidth,hidden:[...document.querySelectorAll('main *')].filter(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return r.height>20&&c.opacity==='0'&&!e.closest('[hidden],dialog,.h3-slide')&&e.tagName!=='INPUT'&&!e.matches('.qs')}).slice(0,5).map(e=>e.className),rail:(()=>{const p=document.querySelector('.rail-pin');return p?getComputedStyle(p).position:null})(),counters:[...document.querySelectorAll('.trust b, .trust strong, .trust [data-count]')].map(e=>e.textContent)})`));
 await ev('scrollTo(0,0)');
}
await b.S('Emulation.setEmulatedMedia',{features:[]});
// custom cursor + forms
await b.viewport(1440,900,false); await b.nav('/test-drive',1200);
console.log('cursor',await ev(`JSON.stringify({cls:document.documentElement.className,bodyCursor:getComputedStyle(document.body).cursor,inputCursor:getComputedStyle(document.querySelector('input,select,textarea')||document.body).cursor,cur:[...document.querySelectorAll('.cur-r,.cur-d')].map(e=>getComputedStyle(e).display+'/'+getComputedStyle(e).opacity)})`));
await b.nav('/contact',1200);
console.log('cursor contact selects',await ev(`JSON.stringify([...document.querySelectorAll('select,input,textarea,a,button')].slice(0,12).map(e=>getComputedStyle(e).cursor).filter((v,i,a)=>a.indexOf(v)===i))`));
await b.viewport(390,844,true); await b.nav('/',1200);
console.log('touch cursor present',await ev(`JSON.stringify({curEls:[...document.querySelectorAll('.cur-r,.cur-d')].map(e=>getComputedStyle(e).display),coarse:matchMedia('(pointer:coarse)').matches,hover:matchMedia('(hover:hover)').matches})`));
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
