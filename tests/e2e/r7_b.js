const { launch, sleep } = require('./cdp5');
(async()=>{const b=await launch();await b.viewport(1440,900,false);await b.nav('/',500);await b.ev(`document.cookie='lang=hi;path=/'`);
for(const p of ['/','/new-cars','/new-cars/model-h','/used-cars']){await b.nav(p,1000);console.log(p,await b.ev(`JSON.stringify({lang:document.documentElement.lang,pr:[...new Set((document.body.innerText.match(/[^\s]+\s?(लाख|करोड़|Lakh|Crore)/g)||[]))].slice(0,6),latin:/Lakh|Crore/.test(document.body.innerText)})`))}
console.log(JSON.stringify(b.errors));b.close();process.exit(0)})();
