'use strict';
// node montage6.js <prefix> <cols> <tileW>  -> $SHOTS/M6_<prefix>.png from all <prefix>_NN.png
const fs = require('fs'), path = require('path'); const { launch, OUT, sleep } = require('./cdp5');
const u = f => 'file:///' + f.split(path.sep).join('/');
(async () => {
  const [pre, cols, tw] = [process.argv[2], +process.argv[3] || 4, +process.argv[4] || 440];
  const files = fs.readdirSync(OUT).filter(f => f.startsWith(pre + '_') && /\d\.png$/.test(f)).sort();
  const html = `<body style="margin:0;background:#444;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;width:${cols * (tw + 6)}px">` + files.map((f, i) => `<div style="position:relative"><img style="width:${tw}px;display:block" src="${u(path.join(OUT, f))}"><b style="position:absolute;left:4px;top:4px;background:#ff0;padding:2px 5px;font:12px sans-serif">${i}</b></div>`).join('') + '</body>';
  const hf = path.join(OUT, 'm_tmp.html'); fs.writeFileSync(hf, html);
  const b = await launch(); const w = cols * (tw + 6); await b.S('Page.navigate', { url: u(hf) }); await sleep(1500);
  const h = await b.ev('document.documentElement.scrollHeight'); await b.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(800);
  const r = await b.S('Page.captureScreenshot', { format: 'png' }); const out = path.join(OUT, 'M6_' + pre + '.png'); fs.writeFileSync(out, Buffer.from(r.data, 'base64')); console.log(out, files.length, w, h); b.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
