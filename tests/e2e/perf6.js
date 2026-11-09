'use strict';
// Round-6 perf: profiles x pages x viewports, 5 runs each, first (cold) discarded; median + worst of remaining 4... (reports of runs 2-5)
// usage: node perf6.js <profile: f4g4x|f4g|s4g|none> [pagesCsv] [viewportsCsv d,m]
const { launch, sleep } = require('./cdp5');
const PROF = { f4g4x: [1.6, 150, 4], f4g: [1.6, 150, 1], s4g: [0.4, 400, 1], none: [0, 0, 1] };
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  const prof = process.argv[2] || 'f4g4x'; const [mbps, rtt, cpu] = PROF[prof];
  const pages = (process.argv[3] || '/,/new-cars/model-h,/used-cars').split(','); const vps = (process.argv[4] || 'd,m').split(',');
  const b = await launch(); await b.S('Network.setCacheDisabled', { cacheDisabled: true });
  await b.S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cls=0;window.__lcp=0;window.__tbt=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)window.__tbt+=e.duration-50}).observe({type:'longtask',buffered:true})}catch(e){}` });
  let bytes = 0; b.handlers.push(m => { if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength; });
  await b.S('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: mbps ? mbps * 1024 * 1024 / 8 : -1, uploadThroughput: mbps ? 750 * 1024 / 8 : -1 });
  await b.S('Emulation.setCPUThrottlingRate', { rate: cpu });
  for (const v of vps) { const [w, h, m, tag] = v === 'd' ? [1440, 900, false, 'desktop'] : [390, 844, true, 'mobile']; await b.viewport(w, h, m);
    for (const p of pages) { const rows = [];
      for (let i = 0; i < 5; i++) { bytes = 0; await b.nav(p, 2500); await sleep(1500); const r = JSON.parse(await b.ev('JSON.stringify({lcp:Math.round(window.__lcp),cls:+window.__cls.toFixed(4),tbt:Math.round(window.__tbt)})')); rows.push({ ...r, kb: Math.round(bytes / 1024) }); }
      const k = rows.slice(1); const f = key => `med ${med(k.map(r => r[key]))} worst ${Math.max(...k.map(r => r[key]))}`;
      console.log(prof, tag, p, '| cold', JSON.stringify(rows[0]), '| LCP', f('lcp'), '| TBT', f('tbt'), '| CLS', f('cls'), '| KB', f('kb')); } }
  b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
