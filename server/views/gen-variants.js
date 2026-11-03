'use strict';
// Generates resized WebP + JPEG variants of public/img/{cars,used,scenes}/*.jpg into public/img/v/ using headless Chrome/Edge (no npm deps).
// Usage: node server/views/gen-variants.js [baseUrl]   (a running server is needed so the canvas is same-origin; default http://localhost:3000)
// Re-run whenever source photos change. Output name: v/<folder>/<name>-<width>.(webp|jpg)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..', '..', 'public', 'img');
const WIDTHS = { cars: [480, 800, 1280], used: [400, 640], scenes: [800, 1280] };
const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = CHROMES.find(c => fs.existsSync(c));
  if (!chrome) throw new Error('No Chrome/Edge found; set CHROME=path');
  const port = 9600 + Math.floor(Math.random() * 300), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-'));
  const p = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(200); try { const j = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const t = j.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; }); } } catch (e) { /* retry */ } }
  let id = 0; const pend = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d.error); delete pend[d.id]; } };
  const S = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await S('Page.enable'); await S('Page.navigate', { url: BASE + '/robots.txt' }); await sleep(800);
  let n = 0, bytes = 0;
  for (const dir of Object.keys(WIDTHS)) {
    const files = fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.jpg$/i.test(f));
    for (const f of files) {
      const name = f.replace(/\.jpg$/i, '');
      const outDir = path.join(ROOT, 'v', dir); fs.mkdirSync(outDir, { recursive: true });
      const expr = `(async()=>{const b=await (await fetch('/img/${dir}/${f}?_=${Date.now()}')).blob();const bm=await createImageBitmap(b);const out={};for(const w of ${JSON.stringify(WIDTHS[dir])}){const sw=Math.min(w,bm.width),sh=Math.round(bm.height*sw/bm.width);const c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(bm,0,0,sw,sh);out[w]={webp:c.toDataURL('image/webp',0.72).split(',')[1],jpg:c.toDataURL('image/jpeg',0.72).split(',')[1],w:sw,h:sh};}return JSON.stringify(out);})()`;
      const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (!r.result || !r.result.value) { console.error('FAILED', dir, f, JSON.stringify(r).slice(0, 200)); continue; }
      const res = JSON.parse(r.result.value);
      for (const w of Object.keys(res)) for (const ext of ['webp', 'jpg']) { const buf = Buffer.from(res[w][ext], 'base64'); fs.writeFileSync(path.join(outDir, `${name}-${w}.${ext}`), buf); bytes += buf.length; n++; }
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(Object.fromEntries(Object.keys(res).map(w => [w, [res[w].w, res[w].h]]))));
    }
  }
  { // og-default.jpg: 1200x630 cover crop of the CC0 cars/model-s-hero.jpg
    const expr = `(async()=>{const b=await (await fetch('/img/cars/model-s-hero.jpg?_=${Date.now()}')).blob();const bm=await createImageBitmap(b);const c=document.createElement('canvas');c.width=1200;c.height=630;const k=Math.max(1200/bm.width,630/bm.height),w=bm.width*k,h=bm.height*k;c.getContext('2d').drawImage(bm,(1200-w)/2,(630-h)/2,w,h);return c.toDataURL('image/jpeg',0.82).split(',')[1];})()`;
    const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.value) fs.writeFileSync(path.join(ROOT, 'og-default.jpg'), Buffer.from(r.result.value, 'base64'));
  }
  console.log(`wrote ${n} files, ${(bytes / 1024).toFixed(0)} KB`);
  (function(){ try { require('child_process').execSync('taskkill /PID ' + p.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { p.kill(); } })(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
