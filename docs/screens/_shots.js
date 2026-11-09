const { launch, sleep } = require('D:/car_dealership/tests/e2e/cdp5');
const fs=require('fs');const OUTD='D:/car_dealership/docs/screens/';
const which=(process.argv[2]||'all').split(',');
(async()=>{const b=await launch();const ev=b.ev;
const shot=async n=>{const r=await b.S('Page.captureScreenshot',{format:'jpeg',quality:85});fs.writeFileSync(OUTD+n+'.jpg',Buffer.from(r.data,'base64'));console.log('shot',n,JSON.stringify(b.errors.slice(0,3)))};
const setv=(s,v)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const click=s=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});if(!e)return 'NOEL';e.click();return 'ok'})()`);
const clickT=(re,sel='button,a,[role=tab]')=>ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>${re}.test(b.innerText.trim())&&b.offsetParent!==null);if(!e)return 'NOEL';e.click();return 'ok'})()`);
const login=async(em,pw)=>{await b.nav('/staff/login',600);await setv('#em',em);await setv('#pw',pw);await ev(`document.querySelector('#lf').requestSubmit()`);await sleep(1800)};
const logout=async()=>{await b.S('Network.clearBrowserCookies');await ev(`try{localStorage.clear();sessionStorage.clear()}catch(e){}`)};
const D=()=>b.viewport(1440,900,false), M=()=>b.viewport(390,844,true);
const want=n=>which[0]==='all'||which.includes(n);
if(want('1')){await D();await b.nav('/',3000);await shot('01-home-hero-desktop')}
if(want('2')){await M();await b.nav('/',3000);await shot('02-home-hero-mobile')}
if(want('3')){await D();await b.nav('/',1500);await ev(`document.querySelector('[data-budget]').scrollIntoView({block:'center'})`);await sleep(800);
 await ev(`(()=>{const e=document.querySelector('#b-emi');e.value=(+e.min+ +e.max)/2;e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(1800);await shot('03-home-budget-slider-desktop')}
if(want('4')){await D();await b.nav('/',1500);await ev(`document.querySelector('[data-finder-open]').scrollIntoView({block:'center'})`);await sleep(600);await click('[data-finder-open]');await sleep(1200);
 console.log(await ev(`document.querySelector('#finder').innerText.slice(0,200)`));await ev(`(()=>{const i=document.querySelector('#finder input');if(i)i.click()})()`);await sleep(600);await shot('04-home-find-my-car-dialog')}
if(want('5')){await D();await b.nav('/new-cars/model-h',1500);await ev(`document.querySelector('#pb-city').value='lucknow';document.querySelector('#pb-city').dispatchEvent(new Event('change',{bubbles:true}))`);await sleep(1200);
 console.log(await ev(`[...document.querySelector('#pb-city').options].map(o=>o.value).join()`));
 await ev(`document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,document.querySelector('[data-onroad]').getBoundingClientRect().top+scrollY-90)`);await sleep(1800);await shot('05-model-page-onroad-waterfall')}
if(want('6')){await D();await b.nav('/used-cars/uc-1182-model-c-vx-2022',1500);console.log(await ev(`(()=>{const d=document.querySelector('details.insp');const sec=d.closest('section')||d;const y=sec.getBoundingClientRect().top+scrollY+40;document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,y);return y+' '+sec.className})()`));await sleep(1000);await ev(`document.querySelectorAll('details.insp').forEach((d,i)=>{if(0)d.open=true})`);await sleep(1800);await shot('06-used-car-detail-inspection')}
if(want('7')||want('8')){await D();await b.nav('/test-drive',1500);
 await click('[name=modelId]');await click('[data-next]');await sleep(800);await click('[name=showroomId]');await click('[data-next]');await sleep(1500);
 for(let k=0;k<6;k++){await ev('(()=>{const d=[...document.querySelectorAll("form[data-td] [name=date]")].filter(e=>!e.disabled)['+k+'];if(d)d.click()})()');await sleep(1800);if(await ev('!![...document.querySelectorAll("form[data-td] .slot input")].find(e=>!e.disabled)'))break}
await ev('document.querySelector("form[data-td] .slot input:not(:disabled)").click()');await sleep(400);
 await ev(`document.querySelector('form[data-td] [name=date]').scrollIntoView({block:'center'})`);await sleep(800);await shot('07-test-drive-slots');
 await click('[data-next]');await sleep(400);
 await ev(`(()=>{const f=document.querySelector('form[data-td]');const set=(n,v)=>{f.elements[n].value=v;f.elements[n].dispatchEvent(new Event('input',{bubbles:true}))};set('name','Demo Buyer');set('phone','9876543210');const c=f.elements.consent;if(c&&!c.checked)c.click()})()`);
 await click('[data-submit]');await sleep(2500);await ev(`(document.querySelector('.ticket')||document.body).scrollIntoView({block:'center'})`);await sleep(1200);await shot('08-booking-ticket')}
if(want('9')){await b.viewport(1440,1300,false);await login('priya@companya.in','Sales@123');await b.nav('/staff/leads',1500);
 await click('.lrow[data-id="3"]');await sleep(3500);await ev('document.querySelector("#drawer .dr-b, #drawer [class*=dr-]:not(.dr-h)")');await ev('(()=>{const d=document.querySelector("#drawer");const s=[d,...d.querySelectorAll("*")].find(e=>e.scrollHeight>e.clientHeight+50&&getComputedStyle(e).overflowY!=="visible");if(s)s.scrollTop=400})()');await sleep(600);await shot('09-staff-lead-inbox-ai-drawer')}
if(want('10')){await logout();await D();await login('desk@companya.in','Desk@123');await b.nav('/staff/desk',2000);await shot('10-lead-desk-sla')}
if(want('11')){await logout();await D();await login('principal@companya.in','Principal@123');await b.nav('/exec',3000);await shot('11-exec-dashboard')}
if(want('12')){await logout();await b.viewport(1440,1400,false);await login('admin@companya.in','Admin@123');await b.nav('/admin/prices',2500);await shot('12-admin-prices')}
if(want('13')){await logout();await D();await b.nav('/account',1200);await setv('#s-ph','9876500001');await ev(`document.querySelector('#f1').requestSubmit()`);await sleep(1200);
 await setv('#s-otp','123456');await ev(`document.querySelector('#f2').requestSubmit()`);await sleep(2000);
 console.log(await clickT(/booking/i));await sleep(1200);await shot('13-account-portal')}
if(want('14')){await M();await b.nav('/service',1500);
 await ev(`(()=>{const f=document.querySelector('form[data-sv]');const set=(n,v)=>{f.elements[n].value=v;f.elements[n].dispatchEvent(new Event('input',{bubbles:true}))};set('name','Demo Buyer');set('phone','9876543211');set('regNo','UP32AB1234');set('model','Model H');f.querySelector('[name=workshopId]').click();})()`);await sleep(500);
 await ev(`document.querySelectorAll('form[data-sv] [name=date]')[2].click()`);await sleep(1800);
 await ev(`document.querySelector('form[data-sv] .slot input:not(:disabled)').click()`);await ev(`document.querySelector('form[data-sv] .slot').scrollIntoView({block:'center'})`);await sleep(1000);await shot('14-service-booking-mobile')}
if(want('15')){await D();await b.nav('/new-cars/model-s?lang=hi',3000);await shot('15-hindi-model-page')}
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
