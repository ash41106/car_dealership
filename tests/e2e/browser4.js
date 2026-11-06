'use strict';
// Round-4 CDP driver: honest home-page weight/LCP under throttling, per-page console/image/overflow audit, screenshots.
// Usage: BASE_URL=http://localhost:3500 SHOTS=dir node tests/e2e/browser4.js [perf|pages]
const { spawn } = require('node:child_process'); const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const BASE = (process.env.BASE_URL || 'http://localhost:3500').replace(/\/$/, '');
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'qa4-shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function launch() {
  const port = 9300 + Math.floor(Math.random() * 400); const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'qa4-prof-'));
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pend.delete(i); rej(new Error('CDP timeout ' + method)); }, 30000); pend.set(i, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  async function page() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId); const st = { errors: [], bytes: 0, reqs: 0, imgBytes: 0, sizes: new Map() };
    handlers.push(m => {
      if (m.sessionId !== sessionId) return; const p = m.params;
      if (m.method === 'Runtime.exceptionThrown') st.errors.push('EXC ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(p.type)) st.errors.push('CONSOLE ' + p.args.map(a => a.value || a.description).join(' '));
      if (m.method === 'Log.entryAdded' && p.entry.level === 'error') st.errors.push('LOG ' + p.entry.text + ' ' + (p.entry.url || ''));
      if (m.method === 'Network.responseReceived') { st.sizes.set(p.requestId, { url: p.response.url, type: p.type, status: p.response.status }); if (p.response.status >= 400 && !/favicon/.test(p.response.url)) st.errors.push('HTTP ' + p.response.status + ' ' + p.response.url); }
      if (m.method === 'Network.loadingFinished') { const r = st.sizes.get(p.requestId); st.bytes += p.encodedDataLength; st.reqs++; if (r) { r.bytes = p.encodedDataLength; if (r.type === 'Image') st.imgBytes += p.encodedDataLength; } }
      if (m.method === 'Network.loadingFailed' && !p.canceled) st.errors.push('NETFAIL ' + p.errorText);
    });
    await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
    const ev = async e => { const r = await S('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    const vp = (w, h, mobile) => S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
    const nav = async (p, wait = 1000) => { st.errors = []; st.bytes = 0; st.reqs = 0; st.imgBytes = 0; st.sizes.clear(); await S('Page.navigate', { url: BASE + p }); for (let i = 0; i < 80; i++) { await sleep(150); try { if (await ev('document.readyState') === 'complete') break; } catch { } } await sleep(wait); };
    const shot = async n => { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); };
    return { S, ev, vp, nav, shot, st, send };
  }
  return { page, close: () => { try { ws.close(); proc.kill(); } catch { } } };
}
const LCP_JS = `window.__lcp=0;window.__lcpEl='';new PerformanceObserver(l=>{for(const e of l.getEntries()){window.__lcp=e.startTime;window.__lcpEl=(e.element?e.element.tagName+' '+(e.url||''):'text')}}).observe({type:'largest-contentful-paint',buffered:true});`;
async function perf() {
  const b = await launch(); const out = [];
  for (const [label, w, h, mobile] of [['mobile390', 390, 844, true], ['desktop1440', 1440, 900, false]]) {
    for (const throttle of [false, true]) {
      const runs = [];
      for (let r = 0; r < 3; r++) {
        const P = await b.page(); await P.vp(w, h, mobile);
        await P.S('Page.addScriptToEvaluateOnNewDocument', { source: LCP_JS });
        await P.S('Network.setCacheDisabled', { cacheDisabled: true });
        if (throttle) { await P.S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }); await P.S('Emulation.setCPUThrottlingRate', { rate: 4 }); }
        await P.nav('/', 3500); const lcp = await P.ev('window.__lcp'); const lcpEl = await P.ev('window.__lcpEl'); const initial = P.st.bytes; const initImg = P.st.imgBytes;
        const dom = await P.ev('document.documentElement.scrollHeight');
        for (let y = 0; y < dom; y += 500) { await P.ev(`window.scrollTo(0,${y})`); await sleep(250); } await sleep(1500);
        const big = [...P.st.sizes.values()].sort((a, c) => (c.bytes || 0) - (a.bytes || 0)).slice(0, 4).map(x => (x.url.replace(BASE, '')) + ' ' + Math.round((x.bytes || 0) / 1024) + 'KB');
        runs.push({ lcp: Math.round(lcp), initialKB: Math.round(initial / 1024), afterScrollKB: Math.round(P.st.bytes / 1024), imgInitialKB: Math.round(initImg / 1024), lcpEl, big });
      }
      out.push({ label, throttle, runs }); console.log(label, throttle ? 'FAST4G+4xCPU' : 'unthrottled', JSON.stringify(runs));
    }
  }
  fs.writeFileSync(path.join(OUT, 'perf4.json'), JSON.stringify(out, null, 1)); b.close();
}
const PAGES = ['/', '/new-cars', '/new-cars/model-h', '/used-cars', '/used-cars/uc-1182-model-c-vx-2022', '/test-drive', '/service', '/emi', '/compare', '/contact', '/credits', '/account'];
const STAFF = ['/staff/desk', '/staff/service', '/staff/leads', '/exec', '/admin', '/admin/roles', '/admin/used', '/admin/models'];
async function pages() {
  const b = await launch(); const P = await b.page(); const rows = [];
  const audit = async (p, tag) => {
    await P.nav(p, 1200); const dom = await P.ev('document.documentElement.scrollHeight'); for (let y = 0; y < Math.min(dom, 12000); y += 600) { await P.ev(`window.scrollTo(0,${y})`); await sleep(120); } await P.ev('window.scrollTo(0,0)'); await sleep(500);
    const info = await P.ev(`({title:document.title,h1:document.querySelectorAll('h1').length,hs:document.documentElement.scrollWidth-innerWidth,broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.currentSrc).map(i=>i.currentSrc),noalt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,svgs:document.querySelectorAll('svg.car,.car-svg').length})`);
    return { page: p, tag, errors: [...P.st.errors], ...info };
  };
  const safe = async (p, tag) => { try { return await audit(p, tag); } catch (e) { return { page: p, tag, errors: ['HARNESS ' + e.message], hs: 0, broken: [], h1: -1, noalt: 0, svgs: 0 }; } };
  for (const [w, h, m, tag] of [[390, 844, true, 'm'], [1440, 900, false, 'd']]) {
    await P.vp(w, h, m);
    for (const p of PAGES) { const r = await safe(p, tag); rows.push(r); console.log('done', tag, p, r.errors.length); await P.shot('r4_' + p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '_' + tag); }
  }
  await P.ev(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@companya.in',password:'Admin@123'})}).then(r=>r.status)`);
  for (const [w, h, m, tag] of [[390, 844, true, 'm'], [1440, 900, false, 'd']]) { await P.vp(w, h, m); for (const p of STAFF) { const r = await safe(p, tag); rows.push(r); console.log('done', tag, p, r.errors.length); await P.shot('r4_' + p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '_' + tag); } }
  fs.writeFileSync(path.join(OUT, 'pages4.json'), JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(r.tag, r.page, 'err=' + r.errors.length, 'hscroll=' + r.hs, 'broken=' + r.broken.length, 'h1=' + r.h1, 'noalt=' + r.noalt, 'svg=' + r.svgs, r.errors.slice(0, 2).join(' | '), r.broken.slice(0, 2).join(' '));
  b.close();
}
async function probe() {
  const b = await launch(); const P = await b.page(); await P.vp(+(process.env.W || 390), 844, +(process.env.W || 390) < 800);
  await P.ev(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@companya.in',password:'Admin@123'})}).then(r=>r.status)`).catch(() => 0);
  await P.nav('/'); await P.ev(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@companya.in',password:'Admin@123'})}).then(r=>r.status)`);
  for (const p of (process.env.P || '/admin/used').split(',')) { const t = Date.now(); try { await P.nav(p, 500); const n = await P.ev('document.querySelectorAll("*").length'); console.log(p, 'ok', Date.now() - t, 'ms, nodes', n, P.st.errors.join('|')); await P.shot('probe_' + p.replace(/[^a-z0-9]+/gi, '_')); } catch (e) { console.log(p, 'HANG/ERR', e.message, Date.now() - t); } }
  b.close();
}
async function a11y() {
  const b = await launch(); const P = await b.page(); const R = []; const T = (n, ok, i) => { R.push({ n, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', n, i === undefined ? '' : JSON.stringify(i)); };
  const key = (k, extra = {}) => P.S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: { Tab: 9, Escape: 27, Enter: 13 }[k], ...extra }).then(() => P.S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: { Tab: 9, Escape: 27, Enter: 13 }[k], ...extra }));
  const act = () => P.ev(`(()=>{const a=document.activeElement;return a?a.tagName+'.'+(a.className||'')+'#'+(a.id||'')+' '+(a.getAttribute('aria-label')||a.textContent||'').trim().slice(0,30):'none'})()`);
  // lightbox on used detail
  await P.vp(1440, 900, false); await P.nav('/new-cars/model-h', 800); console.log('LB info', await P.ev(`JSON.stringify({dialogs:document.querySelectorAll('dialog').length,stage:document.querySelectorAll('.stage-img').length,gal:document.querySelectorAll('.gal img').length,nolb:document.querySelectorAll('[data-nolb]').length})`));
  await P.ev(`document.querySelector('.stage img, .gal img').click()`); await sleep(400);
  T('lightbox opens (dialog[open])', await P.ev(`!!document.querySelector('dialog.lb[open]')`));
  const inside = []; for (let i = 0; i < 6; i++) { await key('Tab'); inside.push(await P.ev(`!!document.activeElement.closest('dialog.lb')`)); }
  T('lightbox traps focus on Tab', inside.every(Boolean), inside);
  await key('Escape'); await sleep(300); T('Esc closes lightbox', !(await P.ev(`!!document.querySelector('dialog.lb[open]')`)));
  T('focus returns after lightbox close', await P.ev(`document.activeElement!==document.body`), await act());
  // filters drawer at mobile
  await P.vp(390, 844, true); await P.nav('/used-cars', 800);
  await P.ev(`document.querySelector('.fl-t').click()`); await sleep(500);
  T('filters drawer opens', await P.ev(`document.querySelector('#ufilters').classList.contains('open')`));
  T('focus moves into drawer on open', await P.ev(`!!document.activeElement.closest('#ufilters')`), await act());
  const ins2 = []; for (let i = 0; i < 14; i++) { await key('Tab'); ins2.push(await P.ev(`!!document.activeElement.closest('#ufilters')`)); }
  T('drawer traps focus (14 Tabs stay inside)', ins2.every(Boolean), ins2.map(Number).join(''));
  T('drawer has role/aria-modal or dialog semantics', await P.ev(`(()=>{const f=document.querySelector('#ufilters');return f.getAttribute('role')==='dialog'||f.getAttribute('aria-modal')==='true'})()`));
  await key('Escape'); await sleep(400); T('Esc closes drawer', !(await P.ev(`document.querySelector('#ufilters').classList.contains('open')`)));
  T('focus returns to filter button', await P.ev(`document.activeElement.classList.contains('fl-t')`), await act());
  T('aria-expanded false after close', await P.ev(`document.querySelector('.fl-t').getAttribute('aria-expanded')==='false'`));
  // mobile nav
  await P.nav('/', 600); await P.ev(`document.getElementById('burger').click()`); await sleep(300);
  T('burger sets aria-expanded=true', await P.ev(`document.getElementById('burger').getAttribute('aria-expanded')==='true'`));
  await P.shot('r4_mobilenav'); await key('Escape'); await sleep(200); T('Esc closes mobile nav and refocuses burger', await P.ev(`document.getElementById('burger').getAttribute('aria-expanded')==='false'&&document.activeElement.id==='burger'`));
  // skip link + first tab
  await P.nav('/', 500); await key('Tab'); T('first Tab = skip link', /skip/i.test(await act()), await act());
  // hearts: persistence and aria-pressed
  await P.nav('/used-cars', 800); await P.ev(`document.querySelector('.heart').click()`); await sleep(400);
  T('heart aria-pressed toggles', await P.ev(`document.querySelector('.heart').getAttribute('aria-pressed')==='true'`));
  await P.nav('/used-cars', 800); T('saved heart persists after reload', await P.ev(`document.querySelector('.heart').getAttribute('aria-pressed')==='true'`));
  // compare tray
  await P.vp(1440, 900, false); await P.nav('/new-cars', 800);
  const before = await P.ev(`(()=>{const t=document.querySelector('.cmp');return t?getComputedStyle(t).display+'|'+t.className:'none'})()`);
  await P.ev(`document.querySelectorAll('[data-cmp]')[0].click();document.querySelectorAll('[data-cmp]')[1].click()`).catch(() => 0); await sleep(500);
  console.log('tray before', before, 'tray text', await P.ev(`(document.querySelector('.cmp')||{}).innerText`));
  await P.shot('r4_compare_tray');
  // reduced motion
  await P.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await P.nav('/', 1500);
  const anim = await P.ev(`document.getAnimations().filter(a=>a.playState==='running').map(a=>(a.effect&&a.effect.target?a.effect.target.className:'')+':'+(a.animationName||a.transitionProperty||'')).slice(0,10)`);
  T('reduced-motion: no infinite running animations on home', (await P.ev(`document.getAnimations().filter(a=>a.playState==='running'&&a.effect.getTiming().iterations===Infinity).length`)) === 0, anim);
  await P.S('Emulation.setEmulatedMedia', { features: [] });
  // Hindi coverage
  await P.nav('/?lang=hi', 300);
  for (const p of ['/', '/used-cars', '/new-cars/model-h', '/compare', '/test-drive', '/account', '/used-cars/uc-1182-model-c-vx-2022']) { await P.nav(p, 700); const lat = await P.ev(`(()=>{const out=[];document.querySelectorAll('button,a.btn,label,h1,h2,h3,summary,.chip,th').forEach(e=>{const t=(e.innerText||'').trim();if(t&&/^[A-Za-z][A-Za-z ,.&\/+-]{3,}$/.test(t)&&!/^(Model [A-Z]|EMI|SUV|MPV|CNG|LX|VX|ZX|Petrol|Diesel|Manual|Automatic|AMT|Brand X)/.test(t))out.push(t)});return [...new Set(out)].slice(0,12)})()`); console.log('HI', p, JSON.stringify(lat)); }
  // empty states
  await P.nav('/?lang=en', 300); await P.nav('/compare', 600); console.log('compare empty:', (await P.ev(`document.querySelector('main').innerText`)).slice(0, 160).split(String.fromCharCode(10)).join(' | '));
  console.log('A11Y', R.filter(r => r.ok).length + '/' + R.length); b.close();
}
async function misc() {
  const b = await launch(); const P = await b.page(); await P.vp(1440, 900, false);
  await P.nav('/', 300); await P.ev(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@companya.in',password:'Admin@123'})}).then(r=>r.status)`);
  await P.nav('/admin/roles', 800);
  const bx = await P.ev(`(()=>{const i=document.querySelector('[data-role="consultant"]:not(:checked):not(:disabled)');i.click();return i.getAttribute('data-role')+':'+i.getAttribute('data-perm')})()`); await sleep(400);
  console.log('toggled', bx, 'savebar visible', await P.ev(`(()=>{const b=document.getElementById('rbar');return !!b&&b.offsetHeight>0&&getComputedStyle(b).display!=='none'?b.innerText.split(String.fromCharCode(10)).join(' '):'NO BAR'})()`)); await P.shot('r4_roles_bar');
  await P.ev(`[...document.querySelectorAll('#rbar button')].find(x=>/save|review/i.test(x.innerText)).click()`); await sleep(500);
  console.log('confirm dialog open', await P.ev(`(()=>{const d=document.querySelector('dialog[open]');return d?d.innerText.split(String.fromCharCode(10)).join(' ').slice(0,300):'NONE'})()`)); await P.shot('r4_roles_confirm');
  await P.ev(`document.querySelector('dialog[open] button[type=button],dialog[open] .btn-o')&&0`);
  // sticky story
  await P.nav('/', 1500); const y = await P.ev(`(()=>{const s=document.querySelector('.story-vis');const r=s.parentElement.getBoundingClientRect();return Math.round(r.top+scrollY)+'|'+Math.round(r.height)})()`); const [top, h] = y.split('|').map(Number);
  const pos = []; for (const off of [100, h * 0.4, h * 0.7]) { await P.ev(`scrollTo(0,${top + off})`); await sleep(500); pos.push(await P.ev(`Math.round(document.querySelector('.story-vis').getBoundingClientRect().top)`)); }
  console.log('story-vis top at 3 scroll offsets (sticky if ~96 each):', pos.join(','), 'section h', h);
  // hero blank panel check at 2s and 7s
  await P.nav('/', 2000); await P.shot('r4_home_2s'); await sleep(5000); await P.shot('r4_home_7s');
  console.log('hero imgs', await P.ev(`[...document.querySelectorAll('.hero2 img')].map(i=>(i.currentSrc||'').split('/').pop()+':'+i.naturalWidth+':'+getComputedStyle(i).opacity).join(' ')`));
  b.close();
}
({ perf, pages, probe, a11y, misc }[process.argv[2] || 'perf'])().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
