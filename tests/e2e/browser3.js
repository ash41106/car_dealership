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
  const port = 9800 + Math.floor(Math.random() * 500);
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
  const shotsOut = OUT; const txt = () => ev('document.body.innerText');
  const metrics = () => ev(`(()=>{const de=document.documentElement;const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('[data-allow-scroll],.strip,.marquee,.drag')}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,30));
    const small=[...document.querySelectorAll('a,button,input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&(r.height<40||r.width<40)&&e.type!=='hidden'&&e.type!=='checkbox'&&e.type!=='radio'&&cs.visibility!=='hidden'&&cs.display!=='none'}).length;
    const broken=[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src.slice(-40));
    return {sw:de.scrollWidth,iw:innerWidth,over,small,broken,h1:document.querySelectorAll('h1').length,imgs:document.images.length}})()`);
  // ---- 1. public visuals
  const pub = ['/', '/new-cars', '/new-cars/model-h', '/used-cars', '/used-cars/uc-1182-model-c-vx-2022', '/test-drive', '/service', '/compare', '/credits', '/account', '/emi', '/contact'];
  for (const [vw, vh, mob, tag] of [[1440, 900, false, 'd'], [390, 844, true, 'm']]) {
    await viewport(vw, vh, mob);
    for (const p of pub) {
      await nav(p, 1500); await ev(`window.scrollTo(0,0)`);
      const slug = 'r3_' + (p === '/' ? 'home' : p.replace(/\W+/g, '_')) + '_' + tag; await shot(slug);
      const m = await metrics(); report(`${tag} ${p}`);
      T(`${tag} ${p}: no horizontal scroll`, m.sw <= m.iw + 1, `sw=${m.sw} iw=${m.iw} ${m.over.join(',')}`);
      T(`${tag} ${p}: no broken images`, m.broken.length === 0, m.broken.join(','));
      T(`${tag} ${p}: one h1`, m.h1 === 1, m.h1);
      if (tag === 'm') T(`m ${p}: tap targets (small count<=3)`, m.small <= 3, m.small);
      if (p === '/') { for (let y = 900; y < 6000; y += 900) { await ev(`window.scrollTo(0,${y})`); await sleep(350); if (y === 1800 || y === 3600) await shot(slug + '_s' + y); } }
    }
  }
  // home full-page weight with real browser (all resources incl. lazy via scroll)
  await viewport(390, 844, true);
  const perf = async (p, label) => {
    await S('Network.clearBrowserCache'); let bytes = 0, imgBytes = 0, n = 0; const reqs = {}; const h = m => { if (m.sessionId !== sessionId) return; if (m.method === 'Network.responseReceived') reqs[m.params.requestId] = { url: m.params.response.url, type: m.params.type }; if (m.method === 'Network.loadingFinished') { const r = reqs[m.params.requestId]; bytes += m.params.encodedDataLength; n++; if (r && r.type === 'Image') imgBytes += m.params.encodedDataLength; if (r) r.size = m.params.encodedDataLength; } }; handlers.push(h);
    const t0 = Date.now(); await nav(p, 500); const loadMs = Date.now() - t0; const lcp0 = await ev(`new Promise(r=>{let v=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())v=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}setTimeout(()=>r(Math.round(v)),600)})`);
    for (let y = 600; y < 9000; y += 700) { await ev(`window.scrollTo(0,${y})`); await sleep(250); }
    await sleep(800); handlers.splice(handlers.indexOf(h), 1);
    const top = Object.values(reqs).filter(r => r.size).sort((a, b) => b.size - a.size).slice(0, 6).map(r => r.url.replace(BASE, '') + ' ' + Math.round(r.size / 1024) + 'K');
    console.log(`PERF ${label} ${p}: total=${Math.round(bytes / 1024)}KB images=${Math.round(imgBytes / 1024)}KB requests=${n} load=${loadMs}ms LCP=${lcp0}ms top=${JSON.stringify(top)}`);
    return { bytes, imgBytes };
  };
  await perf('/', 'mobile-unthrottled'); await perf('/new-cars', 'mobile'); await perf('/new-cars/model-h', 'mobile'); await perf('/used-cars', 'mobile');
  await S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }); await S('Emulation.setCPUThrottlingRate', { rate: 4 });
  await perf('/', 'slow4G+4xCPU'); await S('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await S('Emulation.setCPUThrottlingRate', { rate: 1 });
  // hindi on new pages
  await viewport(390, 844, true);
  for (const p of ['/compare', '/account', '/credits', '/']) { await nav(p + '?lang=hi', 1200); const t = await txt(); const dev = (t.match(/[ऀ-ॿ]/g) || []).length; const eng = (t.match(/[A-Za-z]{4,}/g) || []).length; console.log('HI', p, 'devanagari chars', dev, 'latin words', eng); T('hindi ' + p + ' has Devanagari', dev > 20, dev); await shot('r3_hi_' + p.replace(/\W+/g, '_')); }
  await S('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  ws.close(); proc.kill();
  const f = results.filter(r => !r.ok); console.log(`BROWSER3a: ${results.length - f.length}/${results.length} passed; shots in ${OUT}`);
  fs.writeFileSync(path.join(__dirname, 'last-browser3-results.json'), JSON.stringify(results, null, 1));
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
