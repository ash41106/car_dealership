'use strict';
// Round-5 CDP helper (no deps). Exports launch() -> {S, ev, nav, viewport, shot, close, errors}
const { spawn } = require('node:child_process'); const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const BASE = (process.env.BASE_URL || 'http://localhost:3600').replace(/\/$/, '');
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'qa5-shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function launch(opts = {}) {
  const port = 9300 + Math.floor(Math.random() * 600); const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'qa5-prof-'));
  const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pend.delete(i); rej(new Error('CDP timeout ' + method)); }, 30000); pend.set(i, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const o = { S, errors: [], reqs: [], BASE, OUT, sleep, handlers };
  handlers.push(m => { if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') o.errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(m.params.type)) o.errors.push('CONSOLE ' + m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') o.errors.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.responseReceived') { o.reqs.push({ url: m.params.response.url, status: m.params.response.status }); if (m.params.response.status >= 400 && !/favicon/.test(m.params.response.url)) o.errors.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url); }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) o.errors.push('NETFAIL ' + m.params.errorText);
  });
  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
  o.ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  o.nav = async (p, wait = 1000) => { o.errors = []; await S('Page.navigate', { url: BASE + p }); for (let i = 0; i < 60; i++) { await sleep(150); try { if (await o.ev('document.readyState') === 'complete') break; } catch { } } await sleep(wait); };
  o.viewport = (w, h, mobile) => S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile, hasTouch: !!mobile });
  o.shot = async (name) => { const r = await S('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  o.scroll = async (y) => { await o.ev(`window.scrollTo(0,${y})`); await sleep(700); };
  o.close = () => { try { ws.close(); proc.kill(); } catch { } };
  return o;
}
module.exports = { launch, sleep, BASE, OUT };
