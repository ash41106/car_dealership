'use strict';
// Round-6: main-thread attribution for a page at mobile + Fast4G + 4x CPU. node trace6.js [path]
const { launch, sleep } = require('./cdp5');
(async () => {
  const p = process.argv[2] || '/'; const b = await launch(); await b.viewport(390, 844, true);
  await b.S('Network.setCacheDisabled', { cacheDisabled: true });
  await b.S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 93000 });
  await b.S('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ev = []; b.handlers.push(m => { if (m.method === 'Tracing.dataCollected') ev.push(...m.params.value); });
  let done; const dp = new Promise(r => b.handlers.push(m => { if (m.method === 'Tracing.tracingComplete') r(); }));
  await b.S('Tracing.start', { categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  if (process.env.BLOCK) await b.S('Network.setBlockedURLs',{urls:process.env.BLOCK.split(',')}); await b.nav(p, 4000); await sleep(1500); await b.S('Tracing.end'); await dp;
  const mains = ev.filter(e => e.name === 'thread_name' && e.args.name === 'CrRendererMain'); const cnt = m => ev.filter(e => e.tid === m.tid && e.pid === m.pid && e.ph === 'X').length; const main = mains.sort((a, b) => cnt(b) - cnt(a))[0]; const tid = main.tid, pid = main.pid;
  console.log('events',ev.length,'main',tid,pid, [...new Set(ev.filter(e=>e.tid===tid).map(e=>e.name))].slice(0,25).join(','));const X = ev.filter(e => e.ph === 'X' && e.tid === tid && e.pid === pid);
  console.log('maxRunTask', Math.max(...X.filter(e=>e.name==='RunTask').map(e=>e.dur)), X.length);const tasks = X.filter(e => e.name === 'RunTask' && e.dur > 50000).sort((a, b) => b.dur - a.dur);
  console.log('long tasks', tasks.length, 'total TBT ms', Math.round(tasks.reduce((s, t) => s + t.dur / 1000 - 50, 0)));
  const cat = {}; const scripts = {};
  const names = new Set(['UpdateLayoutTree', 'Layout', 'FunctionCall', 'EvaluateScript', 'v8.compile', 'v8.run', 'Paint', 'ParseHTML', 'RunMicrotasks', 'TimerFire', 'FireAnimationFrame', 'IntersectionObserverController::computeIntersections', 'Decode Image', 'ImageDecodeTask', 'PrePaint', 'Layerize', 'Commit', 'HitTest', 'XHRReadyStateChange', 'ResourceFinish']);
  for (const t of tasks) { const t0 = t.ts, t1 = t.ts + t.dur; const inside = X.filter(e => e.ts >= t0 && e.ts + e.dur <= t1 && e !== t);
    const tops = inside.filter(e => !inside.some(o => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && (o.dur > e.dur) && names.has(o.name) && names.has(e.name) && o.name !== 'FunctionCall' && o.name !== 'v8.run' && 0));
    for (const e of inside) { if (!names.has(e.name)) continue; cat[e.name] = (cat[e.name] || 0) + e.dur / 1000; if ((e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.compile') && e.args?.data?.url) { const u = e.args.data.url.replace(/^https?:\/\/[^/]+/, ''); scripts[u] = (scripts[u] || 0) + e.dur / 1000; } } }
  console.log('inclusive ms by event inside long tasks (nested events overlap):'); Object.entries(cat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(' ', k, Math.round(v)));
  console.log('by script url (FunctionCall/EvaluateScript/compile, inclusive):'); Object.entries(scripts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(' ', k, Math.round(v)));
  console.log('top 6 long tasks (ms) with direct children:'); for (const t of tasks.slice(0, 6)) { const kids = X.filter(e => e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e !== t && e.dur > 8000 && names.has(e.name)).sort((a, b) => b.dur - a.dur).slice(0, 4).map(e => e.name + ' ' + Math.round(e.dur / 1000) + (e.args?.data?.url ? ' ' + e.args.data.url.split('/').pop() : '')); console.log(' ', Math.round(t.dur / 1000), 'at', Math.round((t.ts - ev.find(e => e.name === 'navigationStart')?.ts || 0) / 1000), '|', kids.join('; ')); }
  for (const e of X.filter(e => (e.name==='Layout'||e.name==='UpdateLayoutTree') && e.dur>40000)) console.log('  big', e.name, Math.round(e.dur/1000), 'ms', JSON.stringify(e.args.beginData||e.args.elementCount||{}).slice(0,200), JSON.stringify(e.args.endData||{}).slice(0,160));
  b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
