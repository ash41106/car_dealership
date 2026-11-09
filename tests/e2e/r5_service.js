const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
await b.S('Page.addScriptToEvaluateOnNewDocument',{source:`window.__b=[];const o=URL.createObjectURL;URL.createObjectURL=function(bl){bl.text().then(t=>window.__b.push(t));return o.call(URL,bl)}`});
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
await b.viewport(w,h,m); await b.nav('/service',1500);
await ev(`(()=>{const f=document.querySelector('form[data-sv]');const set=(n,v)=>{f.elements[n].value=v;f.elements[n].dispatchEvent(new Event('input',{bubbles:true}))};set('name','QA Five');set('phone','9876543211');set('regNo','UP32AB1234');set('model','Model H');f.querySelector('[name=workshopId]').click();})()`); await sleep(500);
console.log('dates',await ev(`document.querySelectorAll('form[data-sv] [name=date]').length`), 'serviceType', await ev(`document.querySelector('form[data-sv] [name=serviceType]').outerHTML.slice(0,120)`));
await ev(`document.querySelectorAll('form[data-sv] [name=date]')[2].click()`); await sleep(1500);
console.log('slots',await ev(`[...document.querySelectorAll('form[data-sv] .slot')].map(e=>e.innerText.split(String.fromCharCode(10)).join('/')).join(',')`));
await ev(`document.querySelector('form[data-sv] .slot input:not(:disabled)').click()`);
await ev(`(()=>{const c=document.querySelector('form[data-sv] [name=consent]');if(c&&!c.checked)c.click()})()`);
await b.shot(`sv_${w}_form`);
await ev(`document.querySelector('form[data-sv] [type=submit]').click()`); await sleep(2500);
await b.shot(`sv_${w}_ticket`);
console.log('ticket',await ev(`(document.querySelector('.ticket')||{innerText:'NONE '+document.querySelector('form[data-sv]').innerText.slice(-400)}).innerText.split(String.fromCharCode(10)).join(' | ')`));
console.log('ics',JSON.stringify(await ev(`window.__b&&window.__b[window.__b.length-1]`)));
console.log('errors',JSON.stringify(b.errors.filter(e=>!/vibrate/.test(e))));
}
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
