const { launch, sleep } = require('./cdp5');
const fs=require('fs');
(async()=>{const b=await launch(); const ev=b.ev;
await b.S('Page.addScriptToEvaluateOnNewDocument',{source:`window.__b=[];const o=URL.createObjectURL;URL.createObjectURL=function(bl){bl.text().then(t=>window.__b.push(t));return o.call(URL,bl)}`});
const clickLbl=(sel)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL';e.click();return 'ok'})()`);
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
await b.viewport(w,h,m); await b.nav('/test-drive',1500); await b.shot(`td_${w}_1`);
console.log(w,'models',await ev(`document.querySelectorAll('form[data-td] [name=modelId]').length`),'dates',await ev(`document.querySelectorAll('form[data-td] [name=date]').length`));
await clickLbl('[name=modelId]'); await clickLbl('[data-next]'); await sleep(300);
await clickLbl('[name=showroomId]'); await clickLbl('[data-next]'); await sleep(500);
await b.shot(`td_${w}_3`);
console.log('step3 chips',await ev(`[...document.querySelectorAll('form[data-td] [name=date]')].slice(0,3).map(e=>e.value+':'+e.disabled)`));
// pick a date: first enabled
await ev(`(()=>{const d=[...document.querySelectorAll('form[data-td] [name=date]')].find(e=>!e.disabled);d.click()})()`); await sleep(1500);
await b.shot(`td_${w}_slots`);
console.log('slots',await ev(`[...document.querySelectorAll('form[data-td] .slot input')].map(e=>e.value+(e.disabled?'x':''))`));
await ev(`(()=>{const s=[...document.querySelectorAll('form[data-td] .slot input')].find(e=>!e.disabled);s.click()})()`);
await clickLbl('[data-next]'); await sleep(400);
await ev(`(()=>{const f=document.querySelector('form[data-td]');const set=(n,v)=>{f.elements[n].value=v;f.elements[n].dispatchEvent(new Event('input',{bubbles:true}))};set('name','QA Five');set('phone','9876543210');const c=f.elements.consent;if(c&&!c.checked)c.click()})()`);
await b.shot(`td_${w}_4`);
await clickLbl('[data-submit]'); await sleep(2500);
await b.shot(`td_${w}_ticket`);
console.log('ticket',await ev(`(document.querySelector('.ticket')||{innerText:'NONE '+document.querySelector('form[data-td]').innerText.slice(-300)}).innerText.split(String.fromCharCode(10)).join(' | ')`));
const href=await ev(`(document.querySelector('.tk-act a[download]')||{}).href`);
if(href){const t=await ev(`window.__b[window.__b.length-1]`); fs.writeFileSync(b.OUT+`/booking_${w}.ics`,t); console.log(JSON.stringify(t));}
console.log('wa',await ev(`(document.querySelector('.tk-act a[target]')||{}).href`));
console.log('errors',JSON.stringify(b.errors));
}
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
