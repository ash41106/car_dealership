const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch(); const ev=b.ev;
const key=async(k,code,vk)=>{await b.S('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk,text:k==='Enter'?String.fromCharCode(13):k===' '?' ':undefined});await b.S('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await sleep(150)};
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
await b.viewport(w,h,m); await b.nav('/',1500);
await ev(`document.querySelector('[data-finder-open]').scrollIntoView({block:'center'});document.querySelector('[data-finder-open]').focus()`); await sleep(600);
await key('Enter','Enter',13); await sleep(700);
console.log(w,'open',await ev(`JSON.stringify({open:document.querySelector('#finder').open,active:document.activeElement.className+'|'+document.activeElement.textContent.slice(0,30)})`));
await b.shot(`finder_${w}_1`);
// try next with nothing chosen
await ev(`document.querySelector('#finder [data-next]').click()`); console.log('err shown',await ev(`!document.querySelector('.fd-err').hidden`));
// choose via keyboard: Tab to radio and arrow
await ev(`document.querySelector('.fd-step:not([hidden]) input[type=radio]').focus()`); await key(' ','Space',32);
console.log('checked1',await ev(`document.querySelector('input[name=who]:checked')?.value`));
await ev(`document.querySelector('#finder [data-next]').click()`); await sleep(300);
await ev(`document.querySelector('.fd-step:not([hidden]) input[type=radio]').focus()`); await key(' ','Space',32); await key('ArrowDown','ArrowDown',40);
console.log('where',await ev(`document.querySelector('input[name=where]:checked')?.value`));
await ev(`document.querySelector('#finder [data-next]').click()`); await sleep(300);
await b.shot(`finder_${w}_3`);
await ev(`document.querySelector('#fd-emi').focus()`); await key('ArrowRight','ArrowRight',39);
await ev(`document.querySelector('#finder [data-next]').click()`); await sleep(300);
await ev(`document.querySelector('.fd-step:not([hidden]) input[type=radio]').focus()`); await key(' ','Space',32);
await ev(`document.querySelector('#finder [data-next]').click()`); await sleep(1500);
await b.shot(`finder_${w}_res`);
console.log('results',await ev(`[...document.querySelectorAll('#fd-res li')].map(l=>l.innerText.split(String.fromCharCode(10)).join(' | ')).join(' ## ')`));
console.log('li opacity',await ev(`[...document.querySelectorAll('#fd-res li')].map(l=>getComputedStyle(l).opacity)`));
await key('Escape','Escape',27); await sleep(300);
console.log('esc closes',await ev(`!document.querySelector('#finder').open`),'focus back',await ev(`document.activeElement.hasAttribute('data-finder-open')`));
}
console.log('errors',JSON.stringify(b.errors));b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
