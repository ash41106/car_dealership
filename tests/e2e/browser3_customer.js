'use strict';
// Headless Edge/Chrome driver over CDP (no deps). Usage: BASE_URL=... [BROWSER=path] node tests/e2e/browser.js
// Collects console errors/uncaught exceptions/failed requests on every page and exercises staff/admin JS flows.
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const BASE = (process.env.BASE_URL || 'http://localhost:3200').replace(/\/$/, '');
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'qa-shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const T = (n, ok, info) => { results.push({ name: n, ok: !!ok, info }); if (!ok) console.log('FAIL', n, '=>', String(info || '').slice(0, 300)); };

async function main() {
  const port = 9600 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-prof-'));
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  if (!ver) throw new Error('browser did not start');
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pend.delete(i); rej(new Error('CDP timeout ' + method)); }, 15000); pend.set(i, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  let errors = []; const dialogs = [];
  handlers.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.type + ':' + m.params.message); send('Page.handleJavaScriptDialog', { accept: true }, sessionId); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0] + ' @' + (m.params.exceptionDetails.url || '') + ':' + m.params.exceptionDetails.lineNumber);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(m.params.type)) errors.push('CONSOLE ' + m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !/favicon/.test(m.params.response.url)) errors.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url);
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push('NETFAIL ' + m.params.errorText + ' ' + m.params.requestId);
  });
  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const nav = async (p, wait = 800) => { if (process.env.V) console.log('nav', p); errors = []; await S('Page.navigate', { url: BASE + p }); for (let i = 0; i < 40; i++) { await sleep(150); try { if (await ev('document.readyState') === 'complete') break; } catch { } } await sleep(wait); };
  const viewport = (w, h, mobile) => S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
  const shot = async (name) => { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL';e.click();return 'ok'})()`);
  const setv = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`);
  const report = (label) => { T(label + ': no JS/console/network errors', errors.length === 0, errors.join(' || ')); };
  const txt = () => ev('document.body.innerText');
  const clickText = (re, sel = 'button,a,[role=tab]') => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>${re}.test(b.innerText.trim())&&b.offsetParent!==null);if(!e)return 'NOEL';e.click();return 'ok'})()`);
  const log = (...a) => console.log(...a);
  await viewport(390, 844, true);
  await nav('/account', 1200);
  await setv('#s-ph', '9855500002'); await ev(`document.querySelector('#f1').requestSubmit()`); await sleep(1200);
  log('after phone:', (await txt()).replace(/\s+/g, ' ').slice(0, 300)); await shot('r3_acc_otp'); log('dev otp shown', await ev(`document.querySelector('#dev')?.innerText`));
  await setv('#s-nm', 'QA Customer'); await setv('#s-otp', '123456'); await ev(`document.querySelector('#f2').requestSubmit()`); await sleep(1800); report('login');
  log('after otp:', (await txt()).replace(/\s+/g, ' ').slice(0, 400)); await shot('r3_acc_home');
  const tabs = await ev(`[...document.querySelectorAll('#tab button, [data-t]')].map(b=>b.innerText.trim()+'|'+b.getAttribute('data-t'))`); log('tabs', JSON.stringify(tabs));
  // prefill
  await nav('/test-drive', 1500); const pre = await ev(`({n:document.querySelector('#f-name').value,p:document.querySelector('#f-phone').value})`); T('test-drive prefilled name+phone when signed in', pre.n === 'QA Customer' && /9855500002/.test(pre.p), JSON.stringify(pre)); log('td prefill', JSON.stringify(pre)); report('td page');
  await nav('/service', 1500); const pre2 = await ev(`({n:document.querySelector('[name=name]')?.value,p:document.querySelector('[name=phone]')?.value})`); T('service prefilled when signed in', pre2.n === 'QA Customer', JSON.stringify(pre2));
  // do a test-drive booking through the stepper
  await nav('/test-drive', 1200);
  const step = async () => { await ev(`document.querySelector('[data-next]').click()`); await sleep(400); };
  await ev(`document.querySelector('input[name=modelId]').click()`); await step();
  await ev(`document.querySelector('input[name=showroomId]').click()`); await step(); await sleep(800);
  log('slots', await ev(`[...document.querySelectorAll('[data-slot],.slot,button[data-time]')].length`));
  await ev(`(()=>{const s=document.querySelector('[data-slot]:not([disabled]),.slot:not([disabled]),button[data-time]:not([disabled])');s&&s.click()})()`); await sleep(300);
  await shot('r3_td_step3'); await step(); await sleep(300);
  await ev(`document.querySelector('#c-td').click()`); await shot('r3_td_step4');
  await ev(`document.querySelector('[data-submit]').click()`); await sleep(2000); log('td result', (await txt()).replace(/\s+/g, ' ').slice(0, 300)); await shot('r3_td_done'); report('td submit');
  // account tabs
  await nav('/account', 1500);
  for (const t of ['Bookings', 'Vehicles', 'Saved', 'Enquiries', 'Profile']) { const r = await clickText(new RegExp(t === 'Bookings' ? 'my bookings' : t === 'Vehicles' ? 'my vehicles' : t, 'i'), '#tab button,[data-t]'); await sleep(500); log('tab', t, r, (await txt()).replace(/\s+/g, ' ').slice(300, 520)); await shot('r3_acc_' + t); }
  await clickText(/my bookings/i, '#tab button,[data-t]'); await sleep(500);
  const hasCancel = await ev(`!!document.querySelector('[data-cancel]')`); T('booking visible with cancel in account', hasCancel);
  if (hasCancel) { await ev(`document.querySelector('[data-cancel]').click()`); await sleep(1200); log('after cancel', (await txt()).replace(/\s+/g, ' ').slice(200, 500)); }
  await clickText(/my vehicles/i, '#tab button,[data-t]'); await sleep(400);
  await setv('#v-reg', 'UP32 XY 1234'); await setv('#v-m', 'Model H'); await setv('#v-y', '2019'); await ev(`document.querySelector('#vf').requestSubmit()`); await sleep(1200); const vt = await txt(); T('vehicle added shown', /UP32/i.test(vt) && /Model H/.test(vt), vt.replace(/\s+/g, ' ').slice(200, 500)); await shot('r3_acc_vehicle_added');
  // saved via heart
  await nav('/new-cars/model-h', 1500); log('heart btns', await ev(`[...document.querySelectorAll('[data-save],.heart,[data-heart]')].map(e=>e.className+'|'+e.innerText.trim())`));
  await clickText(/save/i, 'button'); await sleep(900); log('save click result', (await ev(`[...document.querySelectorAll('button')].filter(b=>/sav/i.test(b.innerText)).map(b=>b.innerText.trim()+'|'+b.className+'|'+b.getAttribute('aria-pressed'))`)));
  await nav('/used-cars', 1500); await ev(`document.querySelector('.card [data-save],.heart,[data-heart],.card button[aria-label*=ave]')?.click()`); await sleep(800);
  await nav('/account', 1500); await clickText(/saved/i, '#tab button,[data-t]'); await sleep(500); const sv = await txt(); log('saved tab', sv.replace(/\s+/g, ' ').slice(250, 520)); T('saved cars synced into account', /Model H/.test(sv), sv.replace(/\s+/g, ' ').slice(250, 400));
  // privacy tab
  await clickText(/privacy/i, '#tab button,[data-t]'); await sleep(500); log('profile tab buttons', await ev(`[...document.querySelectorAll('[data-dr]')].map(b=>b.getAttribute('data-dr'))`));
  await ev(`document.querySelector('[data-dr=export]')?.click()`); await sleep(1000); log('export msg', await ev(`document.querySelector('#acc-msg')?.innerText`));
  await ev(`document.querySelector('[data-dr=withdraw_consent]')?.click()`); await sleep(1000); log('withdraw msg', await ev(`document.querySelector('#acc-msg')?.innerText`)); log('dialogs', JSON.stringify(dialogs));
  await ev(`document.querySelector('[data-dr=delete]')?.click()`); await sleep(1000); log('delete msg', await ev(`document.querySelector('#acc-msg')?.innerText`)); await shot('r3_acc_privacy'); report('privacy actions'); log('errors', JSON.stringify(errors)); errors = [];
  await ev(`document.querySelector('#so').click()`); await sleep(1500); log('after signout', (await txt()).replace(/\s+/g, ' ').slice(0, 160)); T('signed out -> sign-in form', await ev(`!!document.querySelector('#f1')`));
  await nav('/test-drive', 1200); T('prefill cleared after signout', (await ev(`document.querySelector('#f-name').value`)) === '', await ev(`document.querySelector('#f-name').value`));
  const f = results.filter(r => !r.ok); log(`CUST: ${results.length - f.length}/${results.length}`); f.forEach(r => log('FAIL', r.name, String(r.info).slice(0, 250)));
  ws.close(); proc.kill();
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
