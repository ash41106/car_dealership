'use strict';
// Round-7: attribute TBT by stripping CSS features at the network layer (Fetch interception). usage: node r7_tbt.js <path> <variantsCsv>
const { launch, sleep } = require('./cdp5');
const V = {
  base: [],
  backdrop: [/(-webkit-)?backdrop-filter\s*:[^;}]+;?/g],
  shadow: [/(?<![-\w])box-shadow\s*:[^;}]+;?/g],
  filter: [/(?<![-\w])filter\s*:[^;}]+;?/g],
  textwrap: [/text-wrap\s*:[^;}]+;?/g],
  p3d: [/transform-style\s*:[^;}]+;?/g, /will-change\s*:[^;}]+;?/g],
  maskclip: [/(-webkit-)?mask(-image)?\s*:[^;}]+;?/g, /clip-path\s*:[^;}]+;?/g],
  vtat: [/@view-transitions*{[^}]*}/g],
  vtname: [/view-transition-names*:[^;}]+;?/g],
  vt: [/@view-transition\s*\{[^}]*\}/g, /view-transition-name\s*:[^;}]+;?/g],
  anim: [/animation(-[a-z]+)?\s*:[^;}]+;?/g, /transition\s*:[^;}]+;?/g],
  alldecor: [/(-webkit-)?backdrop-filter\s*:[^;}]+;?/g, /(?<![-\w])box-shadow\s*:[^;}]+;?/g, /(?<![-\w])filter\s*:[^;}]+;?/g, /text-wrap\s*:[^;}]+;?/g, /transform-style\s*:[^;}]+;?/g, /will-change\s*:[^;}]+;?/g, /clip-path\s*:[^;}]+;?/g, /@view-transition\s*\{[^}]*\}/g, /view-transition-name\s*:[^;}]+;?/g, /animation(-[a-z]+)?\s*:[^;}]+;?/g],
  cv: 'CV'
};
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  const page = process.argv[2] || '/new-cars/model-h'; const names = (process.argv[3] || Object.keys(V).join(',')).split(',');
  const b = await launch(); await b.viewport(390, 844, true); await b.S('Network.setCacheDisabled', { cacheDisabled: true });
  await b.S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__tbt=0;window.__n=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50){window.__tbt+=e.duration-50;window.__n++}}).observe({type:'longtask',buffered:true})` });
  let cur = 'base';
  await b.S('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] });
  b.handlers.push(async m => { if (m.method !== 'Fetch.requestPaused') return; const p = m.params; const ct = (p.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')?.value || '';
    const rid = p.requestId;
    try { if (!/css|html/.test(ct) || !p.responseStatusCode || p.responseStatusCode !== 200) return await b.S('Fetch.continueRequest', { requestId: rid });
      const r = await b.S('Fetch.getResponseBody', { requestId: rid }); let body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
      const v = V[cur]; if (v === 'CV') { if (/css/.test(ct)) body += '\nsection,footer,.sec{content-visibility:auto;contain-intrinsic-size:auto 700px}'; } else for (const re of v) body = body.replace(re, '');
      const hdrs = p.responseHeaders.filter(h => !/content-encoding|content-length/i.test(h.name));
      await b.S('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: hdrs, body: Buffer.from(body).toString('base64') });
    } catch (e) { try { await b.S('Fetch.continueRequest', { requestId: rid }); } catch { } } });
  await b.S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 90000 });
  await b.S('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const n of names) { cur = n; const t = [], c = [];
    for (let i = 0; i < 5; i++) { if (process.env.BLANK) await b.S('Page.navigate', { url: 'about:blank' }); await sleep(300); await b.nav(page, 2000); await sleep(1200); const r = JSON.parse(await b.ev('JSON.stringify({t:Math.round(window.__tbt),n:window.__n})')); if (i) { t.push(r.t); c.push(r.n); } }
    console.log(page, n.padEnd(9), 'TBT med', med(t), 'runs', t.join(','), 'longtasks', c.join(','), 'dom', await b.ev('document.querySelectorAll("*").length+" h="+document.documentElement.scrollHeight')); }
  b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
