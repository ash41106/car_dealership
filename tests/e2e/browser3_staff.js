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
  const port = 9700 + Math.floor(Math.random() * 500);
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
  const txt = () => ev('document.body.innerText'); const log = (...a) => console.log(...a);
  const out = async () => { await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'fetch'},body:'{}'})`); };
  await viewport(1440, 900, false);
  await nav('/staff/login', 1000); log('demo helper', await ev(`[...document.querySelectorAll('button,a,details,summary')].filter(e=>/demo/i.test(e.innerText)).map(e=>e.tagName+':'+e.innerText.slice(0,40))`)); await shot('r3_stafflogin');
  const roles = [['admin@companya.in', 'Admin@123'], ['principal@companya.in', 'Principal@123'], ['desk@companya.in', 'Desk@123'], ['manager.gomti@companya.in', 'Manager@123'], ['priya@companya.in', 'Sales@123'], ['used@companya.in', 'Used@123'], ['content@companya.in', 'Content@123'], ['service@companya.in', 'Service@123'], ['wm.amausi@companya.in', 'Workshop@123']];
  for (const [e, p] of roles) {
    await out(); await nav('/staff/login', 600); errors = [];
    await setv('#em', e); await setv('#pw', p); await ev(`document.querySelector('#lf').requestSubmit()`); await sleep(2000);
    const menu = await ev(`[...document.querySelectorAll('aside a, nav a, .side a, .sb a')].filter(a=>a.offsetParent&&a.getAttribute('href')&&/^[/](staff|admin|exec)/.test(a.getAttribute('href'))).map(a=>a.getAttribute('href'))`);
    log('ROLE', e, 'landing', await ev('location.pathname'), 'menu', JSON.stringify([...new Set(menu)]), 'errors', JSON.stringify(errors.filter(x => !/fx.js/.test(x))));
    await shot('r3_role_' + e.split('@')[0].replace(/\W/g, '_'));
  }
  // write controls for principal
  await out(); await nav('/staff/login', 600); await setv('#em', 'principal@companya.in'); await setv('#pw', 'Principal@123'); await ev(`document.querySelector('#lf').requestSubmit()`); await sleep(1800);
  for (const p of ['/staff/leads', '/staff/desk', '/staff/bookings', '/admin/used', '/admin/users', '/admin/roles', '/admin/audit', '/exec', '/admin']) { await nav(p, 1500); const c = await ev(`[...document.querySelectorAll('button,input[type=submit],select,input:not([type=hidden]),textarea')].filter(e=>e.offsetParent&&!e.closest('header,#nav,.topbar')).map(e=>(e.tagName+':'+(e.innerText||e.name||e.id||e.type)).slice(0,30))`); log('PRINCIPAL', p, (await ev('location.pathname')), JSON.stringify(c).slice(0, 400)); await shot('r3_dp_' + p.replace(/\W+/g, '_')); }
  await nav('/staff/leads', 1500); await ev(`document.querySelector('.lrow')?.click()`); await sleep(1200); log('PRINCIPAL drawer controls', await ev(`[...document.querySelectorAll('#drawer button,#drawer select,#drawer textarea,#drawer input')].filter(e=>e.offsetParent).map(e=>(e.tagName+':'+(e.innerText||e.name||e.id)).slice(0,30))`)); await shot('r3_dp_drawer');
  // admin screens
  await out(); await nav('/staff/login', 600); await setv('#em', 'admin@companya.in'); await setv('#pw', 'Admin@123'); await ev(`document.querySelector('#lf').requestSubmit()`); await sleep(1800);
  for (const p of ['/staff/desk', '/staff/service', '/exec', '/admin/roles', '/admin/users', '/admin/audit']) { errors = []; await nav(p, 2000); log('ADMIN', p, 'errors', JSON.stringify(errors.filter(x => !/fx.js/.test(x)))); await shot('r3_adm_' + p.replace(/\W+/g, '_')); }
  for (const [w, h, m] of [[390, 844, true]]) { await viewport(w, h, m); for (const p of ['/staff/desk', '/staff/service', '/exec', '/admin/roles', '/staff/leads']) { await nav(p, 1800); const mt = await ev(`({sw:document.documentElement.scrollWidth,iw:innerWidth})`); log('MOBILE', p, JSON.stringify(mt)); await shot('r3_adm_m_' + p.replace(/\W+/g, '_')); } }
  ws.close(); proc.kill();
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
