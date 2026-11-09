const { launch, sleep } = require('./cdp5');
(async () => { const w=+process.argv[2]||390; const b = await launch(); await b.viewport(w, w<600?844:900, w<600); await b.nav('/', 2000);
 console.log(JSON.stringify(await b.ev(`(()=>{const rail=document.querySelector('#rail');const o=[];(function walk(e,d){if(d>3)return;for(const c of e.children){const r=c.getBoundingClientRect();const cs=getComputedStyle(c);o.push('  '.repeat(d)+c.tagName+'.'+String(c.className).split(' ').join('.')+' h='+Math.round(r.height)+' pos='+cs.position+' ov='+cs.overflowX+' dsp='+cs.display+' ht='+c.style.height);walk(c,d+1)}})(rail,0);return o.slice(0,25)})()`),null,1));
 b.close(); process.exit(0);})();
