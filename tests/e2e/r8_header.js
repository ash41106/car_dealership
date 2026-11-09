'use strict';
// Header account chip: signed-out "Sign in" -> sign in on /account (no reload) -> chip on every page (EN + HI) -> sign out.
const { launch, sleep } = require('./cdp5');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await launch(); await b.viewport(1440, 900);
  const hdr = () => b.ev(`(()=>{const s=document.querySelector('.hdr .signin');return s?{t:s.textContent.trim(),cls:s.className,al:s.getAttribute('aria-label')}:null})()`);
  await b.nav('/account', 1500);
  let h = await hdr(); ok(h && /Sign in/.test(h.t) && !/in\b/.test(h.cls.replace('signin','')), 'signed out: header says "Sign in" (' + JSON.stringify(h) + ')');
  // sign in through the real form
  await b.ev(`(()=>{const f=document.querySelector('form');const i=f.elements.phone||f.querySelector('input[type=tel],input');i.value='9876500001';f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))})()`);
  await sleep(1200);
  await b.ev(`(()=>{const f=[...document.forms].find(x=>x.elements.otp);f.elements.otp.value='123456';f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))})()`);
  await sleep(2000);
  h = await hdr(); ok(h && /\bin\b/.test(h.cls) && /^D/.test(h.t) && !/Sign in/.test(h.t), 'after sign-in on /account (no reload) header shows chip: ' + JSON.stringify(h));
  ok(h && /My account/.test(h.al || ''), 'chip has accessible label');
  await b.shot('r8_account_signed_in');
  await b.nav('/new-cars', 1200); h = await hdr(); ok(h && /\bin\b/.test(h.cls) && !/Sign in/.test(h.t), '/new-cars shows chip: ' + JSON.stringify(h));
  await b.nav('/new-cars/model-s?lang=hi', 1500); h = await hdr(); ok(h && /\bin\b/.test(h.cls) && /मेरा खाता/.test(h.al || ''), 'Hindi page shows chip with Hindi label: ' + JSON.stringify(h));
  await b.shot('r8_hindi_signed_in');
  await b.nav('/account?lang=en', 1500);
  await b.ev(`document.querySelector('#so').click()`); await sleep(2000);
  h = await hdr(); ok(h && /Sign in/.test(h.t) && !/\bin\b/.test(h.cls.replace('signin','')), 'after sign-out header is back to "Sign in": ' + JSON.stringify(h));
  ok(b.errors.length === 0, 'no console errors ' + JSON.stringify(b.errors.slice(0, 3)));
  b.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
