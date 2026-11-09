'use strict';
// Round-5 perf: Fast 4G (1.6Mbps/150ms) + 4x CPU, cache disabled, 3 runs/page, desktop+mobile. LCP, CLS, TBT (long tasks), transfer.
const { launch, sleep } = require('./cdp5');
(async () => {
  const pages = ['/', '/new-cars/model-h', '/used-cars'];
  const b = await launch();
  await b.S('Network.setCacheDisabled', { cacheDisabled: true });
  await b.S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cls=0;window.__lcp=0;window.__tbt=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)window.__tbt+=e.duration-50}).observe({type:'longtask',buffered:true})}catch(e){}` });
  let bytes = 0; b.handlers.push(m => { if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength; });
  await b.S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }); await b.S('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const [w, h, m, tag] of [[1440, 900, false, 'desktop'], [390, 844, true, 'mobile']]) {
    await b.viewport(w, h, m);
    for (const p of pages) {
      const rows = [];
      for (let i = 0; i < 3; i++) { bytes = 0; await b.nav(p, 3500); await sleep(2500); const r = await b.ev('JSON.stringify({lcp:Math.round(window.__lcp),cls:+window.__cls.toFixed(4),tbt:Math.round(window.__tbt)})'); rows.push({ ...JSON.parse(r), kb: Math.round(bytes / 1024) }); }
      console.log(tag, p, JSON.stringify(rows));
    }
  }
  b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
