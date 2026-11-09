'use strict';
// node imgsheet6.js <out> <cols> <tileW> <glob-ish files...> : contact sheet of served image variants (plate privacy check)
const fs = require('fs'), path = require('path'); const { launch, OUT, sleep } = require('./cdp5');
const u = f => 'file:///' + path.resolve(f).split(path.sep).join('/');
(async () => { const [out, cols, tw, ...files] = process.argv.slice(2);
  const html = `<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:4px">` + files.map(f => `<div style="position:relative"><img style="width:${tw}px;display:block" src="${u(f)}"><b style="position:absolute;left:3px;top:3px;background:#ff0;font:11px sans-serif">${path.basename(f)}</b></div>`).join('') + '</body>';
  const hf = path.join(OUT, 'i_tmp.html'); fs.writeFileSync(hf, html); const b = await launch(); const w = cols * (+tw + 4);
  await b.S('Page.navigate', { url: u(hf) }); await sleep(1500); const h = await b.ev('document.documentElement.scrollHeight');
  await b.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(800);
  const r = await b.S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, out), Buffer.from(r.data, 'base64')); console.log(out, w, h); b.close(); process.exit(0); })();
