const fs=require('fs'),path=require('path');const {launch,OUT}=require('./cdp5');
(async()=>{const b=await launch();await b.viewport(1500,700,false);const u=f=>'file:///'+path.join(OUT,f).split(path.sep).join('/');
await b.S('Page.navigate',{url:'data:text/html,<body style="margin:0;background:#444;display:grid;grid-template-columns:repeat(2,740px);gap:6px">'+['fout_390_a','fout_390_b','fout_1440_a','fout_1440_b'].map(f=>`<img style="height:340px" src="${u(f+'.png')}">`).join('')});
await new Promise(r=>setTimeout(r,1500));const r=await b.S('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'fout_m.png'),Buffer.from(r.data,'base64'));b.close();process.exit(0)})();
