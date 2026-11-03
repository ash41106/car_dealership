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
  const port = 9300 + Math.floor(Math.random() * 500);
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

  // 1. public pages desktop + mobile
  const pages = ['/', '/new-cars', '/new-cars/model-h', '/new-cars/model-v', '/used-cars', '/used-cars/uc-1182-model-c-vx-2022', '/used-cars/uc-1190-model-s-lx-2021', '/test-drive', '/service', '/emi', '/trade-in', '/contact', '/privacy', '/opt-out', '/nope-404', '/staff/login'];
  for (const [vw, vh, mob, tag] of (process.env.FAST ? [] : [[1440, 900, false, 'd'], [390, 844, true, 'm']])) {
    await viewport(vw, vh, mob);
    for (const p of pages) {
      await nav(p);
      const slug = (p === '/' ? 'home' : p.replace(/\W+/g, '_')) + '_' + tag;
      await shot(slug);
      if (!/nope-404/.test(p)) report(`${tag} ${p}`);
      const m = await ev(`(()=>{const de=document.documentElement;const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('[data-allow-overflow],.scroll-x,.table-wrap,.chips,.rail,[style*="overflow"]')}).slice(0,3).map(e=>e.tagName+'.'+e.className);
        const small=[...document.querySelectorAll('a,button,input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<40||r.width<40)&&e.type!=='hidden'&&e.type!=='checkbox'&&e.type!=='radio'&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.sr-only')}).length;
        const unl=[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(e=>!e.labels.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).length;
        const broken=[...document.images].filter(i=>i.complete&&i.naturalWidth===0).length;
        return {sw:de.scrollWidth,iw:innerWidth,over,small,unl,broken,h1:document.querySelectorAll('h1').length,title:document.title}})()`);
      if (!/nope-404/.test(p)) {
        T(`${tag} ${p}: no horizontal scroll`, m.sw <= m.iw + 1, `scrollWidth=${m.sw} vs ${m.iw}; ${m.over.join(',')}`);
        T(`${tag} ${p}: exactly one h1`, m.h1 === 1, m.h1);
        T(`${tag} ${p}: all form controls labelled`, m.unl === 0, m.unl);
        T(`${tag} ${p}: no broken images`, m.broken === 0, m.broken);
        if (tag === 'm') T(`m ${p}: tap targets >=40px (count of small)`, m.small <= 3, m.small);
      }
    }
  }
  // 2. public interactions (mobile viewport still)
  await viewport(1440, 900, false);
  await nav('/new-cars/model-h');
  const before = await ev(`document.body.innerText.match(/On-road[^\\n]*\\n?[^\\n]*/i)?.[0]||''`);
  const sel = await ev(`!!document.querySelector('select[name=city],#city,[data-city]')`); T('model page has city selector', sel);
  const cityPicked = await ev(`(()=>{const s=document.querySelector('select[name=city],#city');if(!s)return 'NOSEL';const o=[...s.options].find(o=>/kanpur/i.test(o.value+o.text));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return o.value})()`);
  await sleep(900);
  const body = await ev('document.body.innerText'); T('city change updates on-road (Kanpur shown)', /Kanpur/i.test(body), cityPicked); report('model city change');
  await shot('model_city_kanpur');
  // lang toggle
  await nav('/?lang=hi'); const hasHi = await ev(`/[\\u0900-\\u097F]/.test(document.body.innerText)`); T('lang toggle shows Hindi in browser', hasHi);
  await nav('/?lang=en');
  // test-drive stepper
  await nav('/test-drive'); await shot('testdrive_d'); report('test-drive load');
  const tdInfo = await ev(`({forms:document.forms.length,steps:document.querySelectorAll('[data-step],.step').length,consent:!!document.querySelector('input[name=consent]'),checked:document.querySelector('input[name=consent]')?.checked})`);
  T('test-drive consent present & unchecked', tdInfo.consent && tdInfo.checked === false, JSON.stringify(tdInfo));
  // submit empty form -> inline errors, no JS error
  await ev(`(()=>{const f=document.querySelector('form');f&&f.requestSubmit?.()})()`); await sleep(600); report('test-drive empty submit');
  await nav('/service'); report('service'); await nav('/emi');
  await ev(`(()=>{const e=document.querySelector('input[type=range],input[name=price],input[name=principal],input[type=number]');if(e){e.value=e.max||900000;e.dispatchEvent(new Event('input',{bubbles:true}))}})()`); await sleep(300); report('emi interact');
  await nav('/used-cars?fuel=Diesel'); report('used filter');
  const usedN = await ev(`document.querySelectorAll('a[href^="/used-cars/"]').length`); T('used list renders cards', usedN >= 1, usedN);


  // 3. staff + admin flows (real browser)
  const loginAs = async (email, pw) => { await nav('/staff/login'); await setv('#em', email); await setv('#pw', pw); await ev(`document.querySelector('#lf').requestSubmit()`); await sleep(1800); };
  await nav('/staff/login'); report('staff login page');
  await setv('#em', 'priya@companya.in'); await setv('#pw', 'WRONG'); await ev(`document.querySelector('#lf').requestSubmit()`); await sleep(1500);
  const bl = await ev(`document.body.innerText + '|' + location.pathname + location.search`);
  T('wrong password: inline error visible (staff.js S.api treats ANY 401 as signed-out and reloads page)', /invalid|incorrect|wrong|failed/i.test(bl), bl.replace(/\s+/g, ' ').slice(0, 160));
  errors = [];
  await loginAs('priya@companya.in', 'Sales@123');
  T('login redirects to /staff/leads', (await ev('location.pathname')) === '/staff/leads', await ev('location.pathname')); report('consultant after login');
  await sleep(800); await shot('staff_leads_d');
  const rows = await ev(`document.querySelectorAll('.lrow').length`); T('lead inbox renders rows', rows > 3, rows);
  T('SLA chips rendered', (await ev(`document.querySelectorAll('.sla').length`)) > 0);
  await ev(`document.querySelector('#f-status').value='new';document.querySelector('#f-status').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(900); report('filter status');
  T('status filter narrows', await ev(`[...document.querySelectorAll('.lrow')].every(r=>/New/.test(r.innerText))`));
  await ev(`(()=>{const q=document.querySelector('#f-q');q.value='Aditya';q.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(1200); report('search');
  await ev(`(()=>{const q=document.querySelector('#f-q');q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));const s=document.querySelector('#f-status');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(1000);
  await ev(`document.querySelector('.lrow').click()`); await sleep(1500); report('open lead drawer'); await shot('staff_drawer_d');
  const drawer = await ev(`document.querySelector('#drawer').innerText`);
  T('drawer shows AI summary block', /Next best action|Model interest/i.test(drawer), drawer.slice(0, 200));
  T('drawer shows AI-generated review notice', /AI-generated/i.test(drawer), '');
  T('drawer has activity timeline', /activity|timeline|created|assigned/i.test(drawer));
  T('send disabled until confirm tick', (await ev(`document.querySelector('#d-send').disabled`)) === true);
  await setv('#d-text', 'Thanks for your enquiry. Would you like to visit our showroom this week?'); await ev(`(()=>{const c=document.querySelector('#d-ok');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));c.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  T('send enabled after confirm', (await ev(`document.querySelector('#d-send').disabled`)) === false);
  await ev(`document.querySelector('#d-send').click()`); await sleep(1500); report('reply send');
  T('reply appears in drawer', /Would you like to visit/.test(await ev(`document.querySelector('#drawer').innerText`)));
  await setv('#d-text', 'We can give 10% discount and Rs 50,000 off'); await ev(`(()=>{const c=document.querySelector('#d-ok');if(!c.checked)c.click();c.dispatchEvent(new Event('change',{bubbles:true}))})()`); await ev(`document.querySelector('#d-send').click()`); await sleep(1200);
  const rej = await ev(`document.body.innerText`); T('discount reply rejected with visible message', /discount|offer|cannot|not allowed|rejected|price/i.test(rej.slice(-700)), rej.slice(-200));
  errors = errors.filter(e => !/422/.test(e));
  await setv('#d-status', 'negotiation'); await setv('#d-notes', 'QA note <b>x</b>'); await ev(`document.querySelector('#d-save').click()`); await sleep(1500); report('status+notes save');
  T('status saved to negotiation', (await ev(`document.querySelector('#d-status').value`)) === 'negotiation');
  const alt = await ev(`(()=>{const s=document.querySelector('#d-user');const o=[...s.options].find(o=>o.value&&o.value!==s.value&&/Rahul|Priya/.test(o.text));return o?o.value:''})()`);
  if (alt) { await setv('#d-user', alt); await setv('#d-reason', 'QA reassign'); await ev(`document.querySelector('#d-re').click()`); await sleep(1500); report('reassign'); } else T('reassign option available', false, 'no alt consultant');
  await ev(`document.querySelector('#ai-regen')&&document.querySelector('#ai-regen').click()`); await sleep(1500); report('ai regenerate');
  await ev(`document.querySelector('#dr-close').click()`); await sleep(500);
  T('stored XSS payload not executed / no injected nodes in inbox', !(await ev(`!!document.querySelector('.lrow img, .lrow script')`)));
  await nav('/staff/import'); await shot('staff_import_d'); report('import page');
  const stamp = String(Date.now());
  const csv = 'Customer Name,Mobile No.,Car Model,City\n"Ba, Tester",9' + stamp.slice(-9) + ',Model H,Lucknow\n"<img src=x onerror=window.__x=1>",9' + String(Number(stamp) + 7).slice(-9) + ',Model S,Kanpur\nBad,123,Model C,Lucknow\n';
  await setv('#im-csv', csv); T('import button disabled before preview', (await ev(`document.querySelector('#im-go').disabled`)) === true);
  const pv = await ev(`(()=>{const b=[...document.querySelectorAll('#imp button')].find(b=>/preview|check|dry/i.test(b.innerText));if(!b)return 'NOBTN';b.click();return 'ok'})()`); await sleep(1800); report('import dry run'); T('import preview button', pv === 'ok', pv);
  const out = await ev(`document.querySelector('#im-out').innerText`); T('preview lists rows and an error row', /error|invalid/i.test(out) && /Ba, Tester/.test(out), out.slice(0, 250));
  T('import XSS payload not executed', (await ev('window.__x')) == null); await shot('staff_import_preview');
  await ev(`document.querySelector('#im-go').click()`); await sleep(2000); report('import real'); T('import completed message', /Done|Imported/i.test(await ev('document.body.innerText')));
  await nav('/staff/bookings'); await shot('staff_bookings_d'); report('bookings page');
  T('bookings list has rows', (await ev(`document.querySelectorAll('#blist > *').length`)) > 0);
  await ev(`(()=>{const t=[...document.querySelectorAll('#btabs button')].find(b=>/service/i.test(b.innerText));t&&t.click()})()`); await sleep(900); report('bookings tab service');
  await ev(`(()=>{const s=document.querySelector('#blist select');if(s){s.selectedIndex=Math.min(1,s.options.length-1);s.dispatchEvent(new Event('change',{bubbles:true}))}})()`); await sleep(1000); report('bookings status change');
  for (const p of ['/admin', '/admin/prices', '/admin/users', '/admin/used']) { await nav(p); const u = await ev('location.pathname'); const t = await ev('document.body.innerText'); T('consultant cannot view ' + p, u !== p || /forbidden|not allowed|denied|403/i.test(t), u + ' ' + t.slice(0, 80)); }
  await viewport(390, 844, true); await nav('/staff/leads'); await shot('staff_leads_m'); report('staff leads mobile');
  T('staff inbox no h-scroll on mobile', (await ev('document.documentElement.scrollWidth')) <= 391, await ev('document.documentElement.scrollWidth'));
  await ev(`document.querySelector('.lrow').click()`); await sleep(1200); await shot('staff_drawer_m'); report('mobile drawer');
  T('mobile drawer no h-scroll', (await ev('document.documentElement.scrollWidth')) <= 391);
  await viewport(1440, 900, false);

  // admin
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'X-Requested-With':'fetch','Content-Type':'application/json'},body:'{}'})`); await sleep(500);
  await loginAs('admin@companya.in', 'Admin@123'); T('admin lands on /admin', (await ev('location.pathname')) === '/admin', await ev('location.pathname')); report('admin login');
  const adminPages = ['/admin', '/admin/models', '/admin/prices', '/admin/used', '/admin/offers', '/admin/banners', '/admin/users', '/admin/showrooms'];
  for (const p of adminPages) { await nav(p, 1500); await shot('admin' + p.replace(/\W+/g, '_')); report('admin ' + p); const rowsN = await ev(`document.querySelectorAll('tbody tr,.kpi,.card').length`); T('admin page rendered data ' + p, rowsN > 1, rowsN); }
  await nav('/admin/models', 1500); const eb = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^edit/i.test(b.innerText.trim()));if(!b)return 'NOEDIT';b.click();return 'ok'})()`); await sleep(1200); report('models edit dialog'); T('models edit dialog opens', eb === 'ok' && (await ev(`!!document.querySelector('dialog[open], #ed[open], #ed.open')`)), eb); await shot('admin_models_edit');
  await ev(`(document.querySelector('#ed-cancel')||{click(){}}).click()`);
  await nav('/admin/prices', 1800);
  const rid = await ev(`(()=>{const i=document.querySelector('#pr-tbl tbody input[data-f=handling][data-id="1"]');return i?i.getAttribute('data-id')+':'+i.value:'NOINPUT'})()`); T('prices table has handling input', rid !== 'NOINPUT', rid);
  const [ridId, oldH] = rid.split(':'); const onroad = async () => (await (await fetch(BASE + '/api/onroad?variant=1&city=lucknow')).json()).on_road; const beforeP = await onroad();
  const setH = (v) => ev(`(()=>{const i=document.querySelector('#pr-tbl tbody input[data-f=handling][data-id="${ridId}"]');i.value='${v}';i.dispatchEvent(new Event('change',{bubbles:true}));i.blur()})()`);
  await setH(Number(oldH) + 1234); await sleep(1500); report('price inline edit');
  const afterP = await onroad(); T('inline price edit in browser changes public on-road by +1234 (Lucknow city rule)', afterP - beforeP === 1234, beforeP + '->' + afterP);
  await setH(oldH); await sleep(1200); T('price restored', (await onroad()) === beforeP);
  await setv('#pc-city', 'kanpur'); await sleep(1200); const pco = await ev(`document.querySelector('#pc-out').innerText`); T('admin price preview calculator renders', /On-road/i.test(pco), pco); report('price preview');
  await shot('admin_prices_after');
  await nav('/admin/used', 1800); const ut = await ev('document.body.innerText'); T('admin used lists stock UC-1182', /UC-1182/.test(ut)); T('admin used shows AI price band w/ review warning', /AI price band/i.test(ut), ut.slice(200, 500));
  const ue = await ev(`(()=>{const b=[...document.querySelectorAll('#u-tbl button')].find(b=>/edit|open/i.test(b.innerText));if(!b)return 'NOEDIT';b.click();return 'ok'})()`); await sleep(1500); report('used edit'); T('used edit opens', ue === 'ok', ue); await shot('admin_used_edit');
  T('used editor shows AI band to admin', /AI-generated|suggest|price band/i.test(await ev(`document.body.innerText`)));
  await nav('/admin/offers', 1500); const ab = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^add|new/i.test(b.innerText.trim()));if(!b)return 'NOADD';b.click();return 'ok'})()`); await sleep(900); report('offers add'); T('offers add dialog', ab === 'ok', ab); await shot('admin_offers_add');
  await nav('/admin/users', 1500); const uu = await ev('document.body.innerText'); T('users page shows roles, no hash', /consultant/i.test(uu) && !/scrypt|hash/i.test(uu));
  await nav('/admin', 1800); T('dashboard shows KPIs + DMS export', /SLA/i.test(await ev('document.body.innerText')) && (await ev(`!!document.querySelector('#dms')`)));

  ws.close(); proc.kill();
  const f = results.filter(r => !r.ok); console.log(`BROWSER: ${results.length - f.length}/${results.length} passed; screenshots in ${OUT}`);
  fs.writeFileSync(path.join(__dirname, 'last-browser-results.json'), JSON.stringify(results, null, 1));
  process.exit(f.length ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
