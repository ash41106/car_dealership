const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch();for(const [w,h,m] of [[1440,900,false],[390,844,true]]){await b.viewport(w,h,m);await b.nav('/new-cars/model-h',1500);
const sel=await b.ev(`(()=>{const e=[...document.querySelectorAll('[class*=wf],[class*=waterfall]')][0];if(!e)return null;e.scrollIntoView({block:'center'});return e.className})()`);console.log(w,sel);await sleep(1800);await b.shot('wf_'+w);
console.log(await b.ev(`JSON.stringify([...document.querySelectorAll('[class*=wf] *')].filter(e=>e.children.length==0&&/₹/.test(e.textContent)).slice(0,3).map(e=>e.textContent.trim()))`))}
b.close();process.exit(0)})();
