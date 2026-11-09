const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
await b.viewport(w,h,m); await b.nav('/',1500);
console.log('--- budget',w);
console.log(await ev(`(()=>{const e=document.querySelector('#b-emi');return JSON.stringify({min:e.min,max:e.max,step:e.step,val:e.value})})()`));
await ev(`document.querySelector('[data-budget]').scrollIntoView({block:'center'})`); await sleep(800);
for (const v of ['MIN','MID','MAX']) {
 await ev(`(()=>{const e=document.querySelector('#b-emi');e.value=${v==='MIN'?'e.min':v==='MAX'?'e.max':'(+e.min+ +e.max)/2'};e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(1200);
 console.log(v, await ev(`JSON.stringify({out:document.querySelector('#b-out').textContent,max:document.querySelector('#b-max').textContent,cnt:document.querySelector('#b-cnt').textContent,vis:[...document.querySelectorAll('#b-grid .bi')].filter(e=>!e.hidden).length,none:!document.querySelector('#b-none').hidden,new:document.querySelector('#b-new').href,used:document.querySelector('#b-used').href})`));
 await b.shot(`budget_${w}_${v}`);
}
}
// keyboard on slider
await b.viewport(1440,900,false); await b.nav('/',1200);
await ev(`document.querySelector('#b-emi').focus()`);
await b.S('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39}); await b.S('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
console.log('kbd slider', await ev(`document.querySelector('#b-emi').value`));
// deep links
for (const p of ['/new-cars?maxPrice=1200000','/used-cars?maxPrice=900000','/new-cars?maxPrice=100']) { await b.nav(p,1200); console.log(p, await ev(`JSON.stringify({cards:document.querySelectorAll('.card').length, h:document.body.innerText.slice(0,0), maxField:(document.querySelector('[name=maxPrice]')||{}).value, txt:(document.querySelector('main').innerText.match(/no .{0,60}|\d+ (cars|results).{0,20}/i)||[''])[0]})`)); }
console.log('errors',JSON.stringify(b.errors));
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
