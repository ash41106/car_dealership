const { launch, sleep } = require('./cdp5'); const fs=require('fs');
(async()=>{const b=await launch(); const ev=b.ev; const dir=b.OUT+'/vt';
fs.mkdirSync(dir,{recursive:true}); let n=0, rec=false; b.handlers.push(m=>{ if(m.method==='Page.screencastFrame'){ if(rec){fs.writeFileSync(`${dir}/f${String(n++).padStart(3,'0')}.jpg`,Buffer.from(m.params.data,'base64'));} b.S('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{}); }});
await b.viewport(1440,900,false);
for (const [from,sel,tag] of [['/','a[href="/new-cars"]','home_to_new'],['/new-cars','a.card[href*="model-h"], a[href*="/new-cars/model-h"]','new_to_model'],['/used-cars','a[href*="/used-cars/uc-"]','used_to_detail']]) {
 await b.nav(from,1500); n=0; rec=true; await b.S('Page.startScreencast',{format:'jpeg',quality:40,everyNthFrame:1});
 await ev(`(()=>{const a=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.getBoundingClientRect().width>0);a.click()})()`); await sleep(1800); await b.S('Page.stopScreencast'); rec=false;
 console.log(tag,'frames',n,'url',await ev('location.pathname'));
 fs.renameSync(dir,dir+'_'+tag); fs.mkdirSync(dir,{recursive:true});
}
b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})
