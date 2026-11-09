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
// Art direction: focal point (x,y as fractions of the source) and zoom (>1 = tighter) per image, so every car is large in a consistent 16:9 (4:3 for used) frame.
// A unified grade (slight desaturation, contrast, cool-shadow/warm-highlight split, vignette) is baked into the variants.
const TARGET_SAT = 0.36; // mean saturation cap: over-saturated blue/red photos are pulled down, muted ones are left alone
const CROP = {
  'cars/model-h-hero': { x: 0.46, y: 0.55, z: 1.04 }, 'cars/model-h-side': { x: 0.6, y: 0.5, z: 1.0 },
  'cars/model-c-hero': { x: 0.5, y: 0.64, z: 1.14 }, 'cars/model-c-side': { x: 0.52, y: 0.55, z: 1.0 },
  'cars/model-s-hero': { x: 0.52, y: 0.4, z: 1.0 }, 'cars/model-s-side': { x: 0.55, y: 0.5, z: 1.0 },
  'cars/model-v-hero': { x: 0.55, y: 0.55, z: 1.06 }, 'cars/model-v-side': { x: 0.52, y: 0.58, z: 1.0 }
};

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
      const cr = CROP[dir + '/' + name] || {}, AR = dir === 'used' ? 4 / 3 : 16 / 9, isHero = /-hero$/.test(name);
      const G = dir === 'cars' ? (isHero ? { f: 'contrast(1.1) saturate(.88) brightness(.86)', v: 0.5 } : { f: 'contrast(1.08) saturate(.9) brightness(.98)', v: 0.3 }) : dir === 'used' ? { f: 'contrast(1.05) saturate(.94) brightness(.99)', v: 0.16 } : { f: 'contrast(1.05) saturate(.85) brightness(.9)', v: 0.2 };
      const expr = `(async()=>{const b=await (await fetch('/img/${dir}/${f}?_=${Date.now()}')).blob();const bm=await createImageBitmap(b);const AR=${AR},fx=${cr.x == null ? 0.5 : cr.x},fy=${cr.y == null ? 0.55 : cr.y},z=${cr.z || 1};
let bw,bh;if(bm.width/bm.height>AR){bh=bm.height;bw=bh*AR}else{bw=bm.width;bh=bw/AR}
const cw=bw/z,ch=bh/z;const sx=Math.max(0,Math.min(bm.width-cw,fx*bm.width-cw/2)),sy=Math.max(0,Math.min(bm.height-ch,fy*bm.height-ch/2));const out={};
const pc=document.createElement('canvas');pc.width=pc.height=48;const px=pc.getContext('2d');px.drawImage(bm,sx,sy,cw,ch,0,0,48,48);const id=px.getImageData(0,0,48,48).data;let sa=0,n=0;for(let i=0;i<id.length;i+=4){const mx=Math.max(id[i],id[i+1],id[i+2]),mn=Math.min(id[i],id[i+1],id[i+2]);if(mx>40){sa+=(mx-mn)/mx;n++}}const avgS=n?sa/n:0.3;const SATF=Math.max(0.55,Math.min(1,${TARGET_SAT}/Math.max(avgS,0.01)));
for(const w of ${JSON.stringify(WIDTHS[dir])}){const sw=Math.min(w,Math.round(cw)),sh=Math.round(sw/AR);const c=document.createElement('canvas');c.width=sw;c.height=sh;const x=c.getContext('2d');
x.filter='${G.f}'.replace(/saturate\\(([\\d.]+)\\)/,(m,v)=>'saturate('+(v*SATF).toFixed(3)+')');x.drawImage(bm,sx,sy,cw,ch,0,0,sw,sh);x.filter='none';
x.globalCompositeOperation='soft-light';let g=x.createLinearGradient(0,0,0,sh);g.addColorStop(0,'rgba(40,70,120,.24)');g.addColorStop(1,'rgba(160,95,50,.2)');x.fillStyle=g;x.fillRect(0,0,sw,sh);
x.globalCompositeOperation='source-over';if(${dir==='cars'?1:0}){const lg=x.createLinearGradient(0,sh*.62,0,sh);lg.addColorStop(0,'rgba(8,8,10,0)');lg.addColorStop(1,'rgba(8,8,10,.38)');x.fillStyle=lg;x.fillRect(0,sh*.62,sw,sh*.38)}const rg=x.createRadialGradient(sw/2,sh*.56,sw*.28,sw/2,sh*.56,sw*.78);rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(0,0,0,${G.v})');x.fillStyle=rg;x.fillRect(0,0,sw,sh);
out[w]={webp:c.toDataURL('image/webp',${isHero ? 0.5 : 0.74}).split(',')[1],jpg:c.toDataURL('image/jpeg',0.74).split(',')[1],w:sw,h:sh};}return JSON.stringify(out);})()`;
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
