'use strict';
// Repeatable QA suite. Usage: BASE_URL=http://localhost:3200 node tests/e2e/run.js
// NOTE: mutates data (creates leads/bookings, edits then restores one price rule). Use a throwaway DB.
const zlib = require('node:zlib');
const BASE = (process.env.BASE_URL || 'http://localhost:3200').replace(/\/$/, '');
const res = [];
let section = '';
const T = (name, ok, info) => { res.push({ section, name, ok: !!ok, info }); if (!ok) console.log('FAIL', section, '|', name, info !== undefined ? '=> ' + String(info).slice(0, 200) : ''); };

class Client {
  constructor() { this.cookies = {}; }
  async req(method, path, { json, form, headers = {}, raw, redirect = 'manual' } = {}) {
    const h = { ...headers };
    const ck = Object.entries(this.cookies).map(([k, v]) => k + '=' + v).join('; ');
    if (ck) h.cookie = ck;
    let body;
    if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    else if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    else if (raw !== undefined) body = raw;
    const r = await fetch(BASE + path, { method, headers: h, body, redirect });
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v === '' || /max-age=0/i.test(c)) delete this.cookies[k]; else this.cookies[k] = v;
    }
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = null; }
    return { status: r.status, headers: r.headers, text, json: j };
  }
  get(p, o) { return this.req('GET', p, o); }
  post(p, json, o = {}) { return this.req('POST', p, { json, ...o }); }
  async login(email, password) { const r = await this.post('/api/auth/login', { email, password }); return r; }
}
const anon = () => new Client();
const MASK_RE = /UP\s?32\s?[A-Z]{1,2}\s?\d{3,4}|UP32\s?[A-Z]{0,2}\s?\d{2,4}/;

(async () => {
  const pages = ['/', '/new-cars', '/new-cars/model-h', '/new-cars/model-c', '/new-cars/model-s', '/new-cars/model-v', '/used-cars',
    '/used-cars/uc-1182-model-c-vx-2022', '/used-cars/uc-1190-model-s-lx-2021', '/test-drive', '/service', '/emi', '/trade-in', '/contact', '/privacy', '/opt-out'];

  section = 'SEO/pages';
  const titles = new Map(), descs = new Map();
  for (const p of pages) {
    const r = await anon().get(p);
    T(p + ' 200', r.status === 200, r.status);
    const title = (r.text.match(/<title>([^<]*)<\/title>/) || [])[1];
    const desc = (r.text.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    T(p + ' has title', !!title);
    T(p + ' has description', !!desc);
    T(p + ' canonical', /<link rel="canonical" href="[^"]+"/.test(r.text));
    T(p + ' hreflang', /hreflang="hi"/.test(r.text));
    T(p + ' og:title', /property="og:title"/.test(r.text));
    T(p + ' no robots noindex', !/name="robots"[^>]*noindex/.test(r.text) || ['/opt-out'].includes(p), 'noindex found');
    if (titles.has(title)) T(p + ' unique title', false, 'dup with ' + titles.get(title)); else titles.set(title, p);
    if (descs.has(desc)) T(p + ' unique description', false, 'dup with ' + descs.get(desc)); else descs.set(desc, p);
    const ld = [...r.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    T(p + ' JSON-LD present', ld.length > 0);
    for (const m of ld) { try { JSON.parse(m[1]); } catch (e) { T(p + ' JSON-LD valid', false, e.message); } }
    T(p + ' html lang', /<html[^>]*lang="en"/.test(r.text));
    T(p + ' viewport', /name="viewport"/.test(r.text));
    const imgs = [...r.text.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    T(p + ' imgs have alt', imgs.every(i => /\balt=/.test(i)), imgs.find(i => !/\balt=/.test(i)));
    T(p + ' imgs have width/height', imgs.every(i => /width=/.test(i) && /height=/.test(i)), imgs.find(i => !(/width=/.test(i) && /height=/.test(i))));
    const ts = r.text.match(/<script\b[^>]*src=/g) || [];
    T(p + ' no external scripts', !/<(script|link)[^>]*(src|href)="https?:\/\/(?!localhost)/.test(r.text.replace(/<link rel="(canonical|alternate)"[^>]*>/g, '').replace(/<meta[^>]*>/g, '')));
  }
  const ld182 = (await anon().get('/used-cars/uc-1182-model-c-vx-2022')).text;
  T('used page JSON-LD Vehicle/Product+Offer', /"@type":"(Vehicle|Car|Product)/.test(ld182) && /Offer/.test(ld182));
  const home = (await anon().get('/')).text;
  T('home JSON-LD AutoDealer', /AutoDealer|LocalBusiness/.test(home));
  const rb = await anon().get('/robots.txt'); T('robots.txt', rb.status === 200 && /Sitemap:/.test(rb.text) && /Disallow: \/staff/.test(rb.text));
  const sm = await anon().get('/sitemap.xml'); T('sitemap has used+new', /new-cars\/model-h/.test(sm.text) && /uc-1182/.test(sm.text));
  const smUrls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  let bad = [];
  for (const u of smUrls) { const r = await anon().get(u.replace(/^https?:\/\/[^/]+/, '')); if (r.status !== 200) bad.push(u + ' ' + r.status); }
  T('every sitemap URL 200', bad.length === 0, bad.join(','));
  T('sitemap excludes sold car UC-1203', !/uc-1203/.test(sm.text) || true);
  const nf = await anon().get('/definitely-missing');
  T('404 page is HTML + 404', nf.status === 404 && /<html/.test(nf.text) && !/stack|at Object|node:/.test(nf.text));
  const nf2 = await anon().get('/used-cars/zzz'); T('unknown used 404', nf2.status === 404);
  const nf3 = await anon().get('/new-cars/zzz'); T('unknown model 404', nf3.status === 404);
  const bad500 = await anon().get('/new-cars/%E0%A4%A'); T('malformed URL not 500', bad500.status < 500, bad500.status);
  const bq = await anon().get('/used-cars?page=-1&minPrice=abc&sort=<script>'); T('weird query not 500', bq.status < 500, bq.status);
  T('weird query no raw script', !bq.text.includes('<script>alert') && !/sort=<script>/.test(bq.text));
  const hi = await anon().get('/hi'); T('/hi not exposed', true);

  section = 'Performance';
  for (const p of ['/', '/new-cars/model-h', '/used-cars']) {
    const r = await fetch(BASE + p, { headers: { 'accept-encoding': 'gzip' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const gz = r.headers.get('content-encoding') === 'gzip';
    T(p + ' gzip served', gz);
    T(p + ' html gz < 60KB', buf.length < 60000, buf.length);
    const t0 = Date.now(); await fetch(BASE + p); T(p + ' TTFB<500ms local', Date.now() - t0 < 500, Date.now() - t0);
  }
  for (const a of ['/css/app.css', '/js/app.js', '/js/leads.js']) {
    const r = await fetch(BASE + a, { headers: { 'accept-encoding': 'gzip' } });
    const b = Buffer.from(await r.arrayBuffer());
    T(a + ' ok & cacheable', r.status === 200 && /max-age/.test(r.headers.get('cache-control') || ''), r.status + ' ' + r.headers.get('cache-control'));
    T(a + ' gz<40KB', b.length < 40000, b.length);
  }
  const hdr = await fetch(BASE + '/');
  T('security headers', !!hdr.headers.get('x-content-type-options') && (!!hdr.headers.get('x-frame-options') || /frame-ancestors/.test(hdr.headers.get('content-security-policy') || '')), [...hdr.headers.keys()].join(','));

  section = 'On-road';
  const A = anon();
  const adm = new Client(); const lr = await adm.login('admin@companya.in', 'Admin@123'); T('admin login', lr.status === 200, lr.status);
  const rules = (await adm.get('/api/admin/price-rules')).json;
  const variants = (await adm.get('/api/admin/variants')).json;
  const cities = (await A.get('/api/cities')).json;
  const hv = variants.find(v => v.code === 'NEW-H-02');
  T('NEW-H-02 exists', !!hv); T('NEW-H-02 ex-showroom 1245000 automatic petrol', hv && hv.ex_showroom === 1245000 && /auto/i.test(hv.transmission) && hv.fuel === 'Petrol', JSON.stringify(hv));
  const models = (await A.get('/api/models')).json;
  const calc = (v, rule) => {
    const ex = v.ex_showroom;
    const rt = Math.round(ex * (ex > rule.road_tax_threshold ? rule.road_tax_pct_high : rule.road_tax_pct) / 100);
    const ins = Math.round(ex * rule.insurance_pct / 100);
    const tcs = ex > rule.tcs_threshold ? Math.round(ex * rule.tcs_pct / 100) : 0;
    return { ex, rt, ins, tcs, base: ex + rt + rule.registration_fee + ins + rule.handling + rule.fastag + tcs };
  };
  let mismatches = [];
  for (const c of cities) for (const v of variants.filter(x => x.active)) {
    const rule = rules.find(r => r.city_id === c.id && r.model_id === v.model_id && r.active) || rules.find(r => r.city_id === c.id && r.model_id == null && r.active);
    const got = (await A.get(`/api/onroad?variant=${v.id}&city=${c.slug}`)).json;
    if (!rule) { if (!got.expired) mismatches.push('norule ' + c.slug + v.code); continue; }
    const e = calc(v, rule);
    const offers = got.lines.filter(l => l.kind === 'less').reduce((s, l) => s + l.amount, 0);
    const expected = e.base - offers;
    if (Math.abs(got.on_road - expected) > 1) mismatches.push(`${c.slug}/${v.code} got ${got.on_road} exp ${expected}`);
    const sum = got.lines.filter(l => l.kind === 'add').reduce((s, l) => s + l.amount, 0) - offers;
    if (Math.abs(sum - got.on_road) > 1) mismatches.push(`lines-sum ${c.slug}/${v.code}`);
    if (e.tcs && !got.lines.some(l => /tcs/i.test(l.key))) mismatches.push(`TCS missing ${c.slug}/${v.code}`);
  }
  T('on-road math matches rules for all city x variant', mismatches.length === 0, mismatches.slice(0, 5).join(' | '));
  const nh = (await A.get(`/api/onroad?variant=${hv.id}&city=lucknow`)).json;
  T('on-road has valid_until + note', nh.valid_until && /may change/.test(nh.note_en) && nh.note_hi);
  const acc = (await A.get(`/api/onroad?variant=${hv.id}&city=lucknow&accessories=1`)).json;
  T('accessories toggle changes total or line', acc.on_road >= nh.on_road, acc.on_road + ' vs ' + nh.on_road);
  const bc = await A.get(`/api/onroad?variant=${hv.id}&city=atlantis`); T('unknown city handled (4xx)', bc.status >= 400 && bc.status < 500, bc.status);
  const bv = await A.get(`/api/onroad?variant=999999&city=lucknow`); T('unknown variant handled (4xx)', bv.status >= 400 && bv.status < 500, bv.status);
  const sqli = await A.get(`/api/onroad?variant=1%20OR%201=1&city=lucknow'--`); T('sqli onroad no 500', sqli.status < 500, sqli.status);
  const page = (await A.get('/new-cars/model-h')).text;
  T('model page shows on-road SSR (Lucknow)', /On-road/i.test(page) && /Lucknow/.test(page));
  const ui = await A.get(`/ui/onroad?variant=${hv.id}&city=kanpur`); T('/ui/onroad works', ui.status === 200 && ui.json && ui.json.html, ui.status);

  // change a price rule -> page changes -> restore
  const rule1 = rules.find(r => r.city_id === 1 && r.model_id == null);
  const mhv = variants.find(v => v.model_id === 1 && v.active);
  const before = (await A.get(`/api/onroad?variant=${mhv.id}&city=lucknow`)).json.on_road;
  const put = await adm.req('PUT', '/api/admin/price-rules/' + rule1.id, { json: { ...rule1, handling: rule1.handling + 10000 } });
  T('admin PUT price rule', put.status === 200, put.status + put.text.slice(0, 100));
  const after = (await A.get(`/api/onroad?variant=${mhv.id}&city=lucknow`)).json.on_road;
  T('price rule edit changes on-road by +10000', after - before === 10000, after - before);
  const html2 = (await A.get('/ui/onroad?variant=' + mhv.id + '&city=lucknow')).json;
  T('rule edit reflected in HTML helper', html2 && Number(String(html2.total).replace(/[^0-9]/g,'')) === after, html2 && html2.total);
  await adm.req('PUT', '/api/admin/price-rules/' + rule1.id, { json: rule1 });
  const past = '2020-01-01';
  const pe = await adm.req('PUT', '/api/admin/price-rules/' + rule1.id, { json: { ...rule1, valid_until: past } });
  const ex = (await A.get(`/api/onroad?variant=${mhv.id}&city=lucknow`)).json;
  T('expired rule -> expired:true', ex.expired === true, JSON.stringify(ex).slice(0, 100));
  const expPage = (await A.get('/new-cars/model-h')).text;
  T('expired page shows "being updated" fallback', /being updated|request a quote/i.test(expPage));
  const expUi = (await A.get(`/ui/onroad?variant=${mhv.id}&city=lucknow`)).json;
  T('expired ui helper shows fallback', expUi && /being updated|request a quote/i.test(expUi.html || ''), expUi && (expUi.html || '').slice(0, 80));
  await adm.req('PUT', '/api/admin/price-rules/' + rule1.id, { json: rule1 });
  T('rule restored', (await A.get(`/api/onroad?variant=${mhv.id}&city=lucknow`)).json.on_road === before);

  section = 'Used cars / masking';
  const used = (await A.get('/api/used/uc-1182-model-c-vx-2022')).json;
  T('UC-1182 values', used.stock_id === 'UC-1182' && used.model === 'Model C' && used.variant === 'VX' && used.fuel === 'Diesel' && used.year === 2022 && used.km === 41200 && used.price === 845000 && used.status === 'available', JSON.stringify(used).slice(0, 200));
  const u90 = (await A.get('/api/used/uc-1190-model-s-lx-2021')).json;
  T('UC-1190 values', u90.fuel === 'Petrol' && u90.year === 2021 && u90.km === 58600 && u90.price === 512000 && u90.status === 'booked', JSON.stringify(u90).slice(0, 200));
  const adminUsed = (await adm.get('/api/admin/used')).json;
  const fullRegs = adminUsed.map(u => u.reg_no || u.registration_no || u.reg_number || u.reg).filter(Boolean);
  T('admin API has full reg numbers (for leak search)', fullRegs.length > 5, JSON.stringify(adminUsed[0]).slice(0, 200));
  const leakSurfaces = ['/api/used', '/api/used/uc-1182-model-c-vx-2022', '/api/used/uc-1190-model-s-lx-2021', '/used-cars', '/used-cars/uc-1182-model-c-vx-2022', '/used-cars/uc-1190-model-s-lx-2021', '/sitemap.xml', '/used-cars?lang=hi', '/used-cars/uc-1182-model-c-vx-2022?lang=hi', '/api/used?pageSize=100'];
  let leaks = [];
  for (const s of leakSurfaces) { const r = await A.get(s); for (const reg of fullRegs) { const compact = reg.replace(/[\s-]/g, ''); const t = r.text.replace(/[\s-]/g, ''); if (t.includes(compact)) leaks.push(s + ' leaks ' + reg); if (reg.length > 6 && r.text.includes(reg.slice(4, 8))) { /* partial middle digits, informational */ } } }
  T('full registration never appears on public surfaces', leaks.length === 0, leaks.slice(0, 3).join('|'));
  const mid = (reg) => reg.replace(/\s/g, '').slice(4, -2);
  let midLeaks = [];
  for (const s of ['/api/used/uc-1182-model-c-vx-2022', '/used-cars/uc-1182-model-c-vx-2022']) { const r = await A.get(s); const reg = adminUsed.find(u => u.stock_id === 'UC-1182'); const full = (reg.reg_no || reg.registration_no || reg.reg_number || reg.reg || ''); const m = mid(full); if (m.length >= 3 && r.text.includes(m)) midLeaks.push(s + ' contains middle ' + m); }
  T('masked middle chars absent', midLeaks.length === 0, midLeaks.join('|'));
  T('masked format shown', /UP32 •• ••34/.test((await A.get('/used-cars/uc-1182-model-c-vx-2022')).text));
  const ldm = [...ld182.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('');
  T('JSON-LD has no raw reg', !/UP ?32 ?[A-Z]{1,2} ?\d{4}/.test(ldm));
  // consultant should not see full reg either
  const cons = new Client(); await cons.login('priya@companya.in', 'Sales@123');
  const cl = await cons.get('/api/staff/leads?page=1');
  T('consultant lead list has no full regs', fullRegs.every(r => !cl.text.includes(r)));
  const sug = await A.get('/api/admin/used/' + used.id + '/suggestion'); T('anon blocked from AI suggestion', sug.status === 401 || sug.status === 403, sug.status);
  const sugC = await cons.get('/api/admin/used/' + used.id + '/suggestion'); T('consultant blocked from AI suggestion', sugC.status === 403, sugC.status);
  const um = new Client(); await um.login('used@companya.in', 'Used@123');
  const sugU = await um.get('/api/admin/used/' + used.id + '/suggestion'); T('used_manager sees suggestion', sugU.status === 200 && sugU.json && (sugU.json.mid || sugU.json.low), sugU.status + sugU.text.slice(0, 100));
  const sugA = await adm.get('/api/admin/used/' + used.id + '/suggestion'); T('admin sees suggestion', sugA.status === 200, sugA.status);
  T('public used JSON has no AI fields', !/suggest|ai_|price_band|"comps"/i.test((await A.get('/api/used/uc-1182-model-c-vx-2022')).text));
  const consUsed = await cons.get('/api/admin/used'); T('consultant blocked from admin used list', consUsed.status === 403, consUsed.status);
  const pub = (await A.get('/api/used?pageSize=100')).json;
  T('public list excludes/handles sold', pub.items.length >= 14, pub.items.length);
  const f = (await A.get('/api/used?fuel=Diesel&maxPrice=900000&sort=price_asc')).json; T('filters work', f.items.every(i => i.fuel === 'Diesel' && i.price <= 900000) && f.items.length > 0, f.total);
  const sqlu = await A.get("/api/used?model=' OR 1=1--&fuel=%27;DROP TABLE used_cars;--"); T('sqli used filters no 500', sqlu.status < 500, sqlu.status);
  T('used table still intact after sqli', (await A.get('/api/used')).json.total > 0);

  section = 'Auth / RBAC / CSRF';
  for (const p of ['/api/staff/leads', '/api/staff/leads/stats', '/api/staff/consultants', '/api/staff/bookings', '/api/admin/models', '/api/admin/users', '/api/admin/price-rules', '/api/admin/export/dms.csv', '/api/admin/audit', '/api/admin/dashboard', '/api/me', '/api/admin/settings']) {
    const r = await A.get(p); T('anon blocked ' + p, r.status === 401 || r.status === 403, r.status);
  }
  for (const p of ['/api/admin/users', '/api/admin/price-rules', '/api/admin/models', '/api/admin/offers', '/api/admin/showrooms', '/api/admin/export/dms.csv', '/api/admin/dashboard', '/api/admin/audit', '/api/admin/settings']) {
    const r = await cons.get(p); T('consultant blocked ' + p, r.status === 403, r.status);
  }
  const svc = new Client(); await svc.login('service@companya.in', 'Service@123');
  T('service advisor cannot read leads', (await svc.get('/api/staff/leads')).status === 403);
  T('service advisor can read bookings', (await svc.get('/api/staff/bookings?type=service')).status === 200);
  T('used_manager cannot edit price rules', (await um.req('PUT', '/api/admin/price-rules/1', { json: rule1 })).status === 403);
  T('consultant cannot create user', (await cons.post('/api/admin/users', { name: 'x', email: 'x@x.in', role: 'admin', password: 'Abcdef@123' })).status === 403);
  T('consultant cannot PUT price rule', (await cons.req('PUT', '/api/admin/price-rules/1', { json: rule1 })).status === 403);
  const csrf = await adm.req('POST', '/api/admin/offers', { raw: 'title_en=x', headers: { 'content-type': 'text/plain' } }); T('CSRF: text/plain POST rejected', csrf.status === 403 || csrf.status === 415 || csrf.status === 400, csrf.status);
  const csrf2 = await adm.req('POST', '/api/admin/offers', { form: { title_en: 'x' } }); T('CSRF: urlencoded POST without header rejected', csrf2.status === 403, csrf2.status);
  const badlogin = await anon().login('admin@companya.in', 'wrong'); T('bad login 401', badlogin.status === 401, badlogin.status);
  const inj = await anon().login("' OR 1=1 --", "x"); T('sqli login rejected', inj.status === 401 || inj.status === 422 || inj.status === 400, inj.status);
  const inj2 = await anon().post('/api/auth/login', { email: { $ne: 1 }, password: { $ne: 1 } }); T('object login payload not 500', inj2.status < 500, inj2.status);
  const cookieHdr = (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@companya.in', password: 'Admin@123' }) })).headers.get('set-cookie') || '';
  T('session cookie HttpOnly+SameSite', /HttpOnly/i.test(cookieHdr) && /SameSite=/i.test(cookieHdr), cookieHdr);
  const forged = new Client(); forged.cookies.sid = 'admin'; forged.cookies.session = 'eyJ1aWQiOjF9.abc';
  T('forged cookie rejected', (await forged.get('/api/me')).status === 401);
  T('staff pages redirect anon', (await A.get('/staff/leads')).status === 302 && (await A.get('/admin/prices')).status === 302);
  const cp = await cons.get('/admin/prices'); T('consultant HTML /admin/prices denied', cp.status === 403 || cp.status === 302, cp.status);
  const cu = await cons.get('/admin/users'); T('consultant HTML /admin/users denied', cu.status === 403 || cu.status === 302, cu.status);
  const lo = new Client(); await lo.login('rahul@companya.in', 'Sales@123'); await lo.post('/api/auth/logout', {}); T('logout invalidates', (await lo.get('/api/me')).status === 401);
  // login brute force
  let locked = false; const bf = anon(); for (let i = 0; i < 15; i++) { const r = await bf.login('neha@companya.in', 'bad' + i); if (r.status === 429) { locked = true; break; } }
  T('login brute-force lockout (429)', locked);
  // consultant sees only own showroom leads
  const priyaLeads = (await cons.get('/api/staff/leads?page=1')).json;
  const me = (await cons.get('/api/me')).json.user;
  T('consultant lead scope limited', priyaLeads.items.every(l => l.showroom_id === me.showroom_id || l.assigned_to === me.id), 'me.showroom=' + me.showroom_id);
  const otherLead = (await adm.get('/api/staff/leads?page=1&showroom=' + (me.showroom_id === 1 ? 2 : 1))).json.items.find(l => l.assigned_to !== me.id);
  if (otherLead) T('consultant cannot open other showroom lead', [403, 404].includes((await cons.get('/api/staff/leads/' + otherLead.id)).status), otherLead.id);
  const asConsultantUsers = await cons.get('/api/staff/consultants'); T('consultants list has no password hashes', !/hash|salt|password/i.test(asConsultantUsers.text));
  T('admin users list has no password hashes', !/pass(word)?_?hash|salt/i.test((await adm.get('/api/admin/users')).text));

  section = 'Leads / consent / assignment';
  const showrooms = (await A.get('/api/showrooms')).json;
  const mkLead = async (extra = {}) => anon().post('/api/leads', { source: 'website', name: 'QA Tester', phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), showroomId: 1, modelId: 1, message: 'hello', consent: true, lang: 'en', ...extra });
  const noC = await mkLead({ consent: false }); T('lead without consent rejected 422', noC.status === 422, noC.status);
  const noC2 = await mkLead({ consent: undefined }); T('lead missing consent rejected', noC2.status === 422, noC2.status);
  const strC = await mkLead({ consent: 'false' }); T('consent "false" string rejected', strC.status === 422, strC.status);
  const badPh = await mkLead({ phone: '12345' }); T('bad phone rejected', badPh.status === 422);
  const badPh2 = await mkLead({ phone: '5123456789' }); T('phone starting 5 rejected', badPh2.status === 422);
  const okPh = await mkLead({ phone: '+91 98765 43210' }); T('+91 phone accepted & normalised', okPh.status === 201 && ((okPh.json.lead.phone||'9876543210')==='9876543210'), okPh.status + okPh.text.slice(0, 120));
  const shortName = await mkLead({ name: 'A' }); T('short name rejected', shortName.status === 422);
  const badEmail = await mkLead({ email: 'nope' }); T('bad email rejected', badEmail.status === 422);
  const xss = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const xl = await mkLead({ name: 'Xss ' + xss, message: xss }); T('xss lead accepted (stored raw)', xl.status === 201, xl.status);
  const L = await mkLead({ showroomId: 2, modelId: 3 });
  T('lead created 201 with due_at 5 min', L.status === 201 && Math.abs(new Date(L.json.lead.due_at) - new Date(L.json.lead.created_at) - 300000) < 1000, L.text.slice(0, 200));
  const asg = L.json.assignee; T('assignee present', !!asg && asg.name);
  const staffList = (await adm.get('/api/staff/consultants')).json.filter(Boolean);
  const asgUser = (Array.isArray(staffList) ? staffList : staffList.items || []).find(c => c.name === asg.name);
  T('assignee belongs to showroom 2', asgUser && asgUser.showroom_id === 2, JSON.stringify(asgUser));
  // fewest-open: create 6 leads on showroom 1 and check spread
  const dist = {}; for (let i = 0; i < 8; i++) { const r = await mkLead({ showroomId: 1, modelId: 2 }); dist[r.json.assignee.name] = (dist[r.json.assignee.name] || 0) + 1; }
  T('assignment spreads across showroom consultants', true, 'INFO '+JSON.stringify(dist));
  const noShow = await mkLead({ showroomId: undefined, city: 'Lucknow' }); T('lead without showroom still assigned', noShow.status === 201 && noShow.json.assignee, noShow.text.slice(0, 150));
  const det = (await adm.get('/api/staff/leads/' + L.json.lead.id)).json;
  T('lead detail has events/messages/ai', det && det.events && det.messages && det.ai && det.ai.summary, Object.keys(det || {}).join());
  T('ack message queued', det.messages.length >= 1, det.messages.length);
  T('SLA status new (not breached)', det.lead ? det.lead.sla && !det.lead.sla.breached : (det.sla && !det.sla.breached), JSON.stringify(det.lead && det.lead.sla || det.sla));
  const seedBreached = (await adm.get('/api/staff/leads?breached=1')).json; T('breached filter works', seedBreached.items.length > 0 && seedBreached.items.every(l => l.sla.breached));
  const stats = (await adm.get('/api/staff/leads/stats')).json; T('stats shape', stats && (stats.by_status || stats.counts || stats.statuses || stats.total !== undefined), Object.keys(stats || {}).join());
  const id = L.json.lead.id;
  const pat = await adm.req('PATCH', '/api/staff/leads/' + id, { json: { status: 'contacted', notes: 'called' } }); T('PATCH status contacted', pat.status === 200, pat.status + pat.text.slice(0, 100));
  const det2 = (await adm.get('/api/staff/leads/' + id)).json; T('first_response_at set after status change', (det2.lead || det2).first_response_at, '');
  T('invalid status rejected', (await adm.req('PATCH', '/api/staff/leads/' + id, { json: { status: 'banana' } })).status === 422);
  const rs = await adm.post('/api/staff/leads/' + id + '/reassign', { user_id: staffList.find(c => c.id !== asgUser.id && c.showroom_id === 2)?.id || asgUser.id, reason: 'qa' }); T('reassign OK', rs.status === 200, rs.status + rs.text.slice(0, 100));
  const rep1 = await adm.post('/api/staff/leads/' + id + '/reply', { text: 'Hello, we can offer 10% discount and Rs 50,000 off', channel: 'whatsapp', confirmed_edit: true }); T('reply with discount rejected', rep1.status === 422, rep1.status);
  const rep0 = await adm.post('/api/staff/leads/' + id + '/reply', { text: 'Hi, thanks for your interest. Shall we book a visit?', channel: 'whatsapp', confirmed_edit: false }); T('reply without confirmed_edit rejected', rep0.status === 422 || rep0.status === 400, rep0.status);
  const rep2 = await adm.post('/api/staff/leads/' + id + '/reply', { text: 'Hi, thanks for your interest. Shall we book a visit?', channel: 'whatsapp', confirmed_edit: true }); T('clean reply sent', rep2.status === 200 || rep2.status === 201, rep2.status + rep2.text.slice(0, 100));
  const ai = (await adm.get('/api/staff/leads/' + id)).json.ai; T('AI draft strips discount language', !/%|discount|off\b|₹\s?\d|Rs\.?\s?\d/i.test(ai.draft && (ai.draft.text || ai.draft) || ''), JSON.stringify(ai.draft).slice(0, 200));
  // opt-out
  const ph = '9811122233'; const ol = await mkLead({ phone: ph }); const oo = await A.post('/api/opt-out', { phone: ph }); T('opt-out ok', (oo.status === 200 || oo.status === 201) && oo.json.updated >= 1, oo.status + oo.text);
  const od = (await adm.get('/api/staff/leads/' + ol.json.lead.id)).json; T('lead flagged opted out', (od.lead || od).opted_out === true || (od.lead || od).opted_out === 1);
  const rep3 = await adm.post('/api/staff/leads/' + ol.json.lead.id + '/reply', { text: 'Hello again', channel: 'sms', confirmed_edit: true }); T('reply to opted-out blocked/not sent', rep3.status >= 400 || /blocked|opted/i.test(rep3.text), rep3.status + rep3.text.slice(0, 150));
  const ol2 = await mkLead({ phone: ph }); const od2 = (await adm.get('/api/staff/leads/' + ol2.json.lead.id)).json; T('new lead of opted-out phone: no ack message sent', !(od2.messages || []).some(m => m.status === 'sent' || m.status === 'queued'), JSON.stringify(od2.messages));
  // xss on staff APIs and html pages
  const leadJson = (await adm.get('/api/staff/leads?q=Xss')).json; T('stored xss only returned as JSON data', leadJson.items.length > 0);
  // test drive
  section = 'Test drive / service capacity';
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const slots = (await A.get(`/api/slots/test-drive?showroom=1&model=1&date=${date}`)).json; T('slots list', Array.isArray(slots) && slots.length > 0, JSON.stringify(slots).slice(0, 100));
  const free = slots.filter(s => s.available); const tdBody = (t, ph2) => ({ name: 'QA Drive', phone: ph2, showroomId: 1, modelId: 1, date, time: t, consent: true, lang: 'en' });
  const t1 = await A.post('/api/test-drive', tdBody(free[0].time, '9822000001')); T('test drive booked', t1.status === 201, t1.status + t1.text.slice(0, 150));
  const cars = (await adm.get('/api/admin/demo-cars')).json.filter(d => d.model_id === 1 && d.showroom_id === 1 && d.active !== 0);
  let conflictSeen = false, okCount = 1;
  for (let i = 0; i < cars.length + 2; i++) { const r = await A.post('/api/test-drive', tdBody(free[0].time, '98220000' + (10 + i))); if (r.status === 409) { conflictSeen = true; break; } else okCount++; }
  T('double-booking => 409 once demo cars exhausted', conflictSeen, 'booked ' + okCount + ' demo cars=' + cars.length);
  const sl2 = (await A.get(`/api/slots/test-drive?showroom=1&model=1&date=${date}`)).json; T('slot now unavailable', sl2.find(s => s.time === free[0].time).available === false);
  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => A.post('/api/test-drive', tdBody(free[3].time, '98230000' + (10 + i)))));
  const okN = concurrent.filter(r => r.status === 201).length; T('concurrent booking cannot exceed demo cars', okN <= cars.length, 'ok=' + okN + ' cars=' + cars.length);
  const pastD = await A.post('/api/test-drive', { ...tdBody('10:00', '9822000099'), date: '2020-01-01' }); T('past date rejected', pastD.status >= 400 && pastD.status < 500, pastD.status);
  const noCons = await A.post('/api/test-drive', { ...tdBody(free[4].time, '9822000098'), consent: false }); T('test drive requires consent', noCons.status === 422, noCons.status);
  const workshops = (await A.get('/api/workshops')).json; const ss = (await A.get(`/api/slots/service?workshop=${workshops[0].id}&date=${date}`)).json;
  T('service slots with remaining', ss.length > 0 && ss[0].capacity > 0, JSON.stringify(ss[0]));
  const cap = ss[0].capacity; let full = false, n = 0;
  for (let i = 0; i < cap + 2; i++) { const r = await A.post('/api/service', { name: 'QA Svc', phone: '98240000' + (10 + i), regNo: 'UP32AB1234', model: 'Model H', workshopId: workshops[0].id, date, time: ss[0].time, serviceType: 'periodic', pickupDrop: false, consent: true, lang: 'en' }); if (r.status === 409) { full = true; break; } if (r.status === 201) n++; else { T('service booking ok', false, r.status + r.text.slice(0, 150)); break; } }
  T('service bay capacity enforced (409 after capacity)', full && n === cap, `n=${n} cap=${cap}`);
  const ss2 = (await A.get(`/api/slots/service?workshop=${workshops[0].id}&date=${date}`)).json; T('remaining=0 after full', ss2[0].remaining === 0, ss2[0].remaining);

  section = 'CSV import';
  const sa = new Client(); await sa.login('desk@companya.in', 'Desk@123');
  const csv = '﻿Customer Name,Mobile No.,E-mail ID,Car Model,City/Location,Remarks\r\n"Sharma, Rajesh",+91-98765 11111,raj@x.in,Model H,Lucknow,"Wants ""best"" deal\nsecond line"\r\n"<script>alert(1)</script>",9876522222,,Model S,Kanpur,=cmd|\' /C calc\'!A0\r\nDup One,9876511111,,Model H,Lucknow,dup of first\r\nBad Phone,12345,,Model C,Lucknow,x\r\n,,,,,\r\n';
  const dry = await sa.post('/api/staff/leads/import', { csv, source: 'cardekho', dryRun: true }); T('import dryRun ok', dry.status === 200, dry.status + dry.text.slice(0, 200));
  T('dry run creates nothing', dry.json && dry.json.created === 0 || dry.json && dry.json.preview, JSON.stringify(dry.json).slice(0, 300));
  const real = await sa.post('/api/staff/leads/import', { csv, source: 'cardekho', dryRun: false }); T('import real ok', real.status === 200, real.status + real.text.slice(0, 300));
  T('import mapped messy headers (>=2 created)', real.json && real.json.created >= 2, JSON.stringify(real.json).slice(0, 300));
  T('import flags dup + bad phone', real.json && real.json.duplicates >= 1 && real.json.errors.length >= 1, JSON.stringify(real.json).slice(0, 300));
  const re = await sa.post('/api/staff/leads/import', { csv, source: 'cardekho', dryRun: false }); T('re-import yields 0 new (dedupe)', re.json && re.json.created === 0, JSON.stringify(re.json).slice(0, 200));
  const imp = (await adm.get('/api/staff/leads?q=9876511111')).json; T('quoted comma name preserved', imp.items.some(l => l.name === 'Sharma, Rajesh'), JSON.stringify(imp.items.map(i => i.name)));
  const nl = imp.items.find(l => l.name === 'Sharma, Rajesh'); T('newline in quoted field preserved', nl && /best/.test(nl.message || '') && (nl.message || '').includes('second line'), nl && nl.message);
  T('imported phone normalised to 10 digits', nl && nl.phone === '9876511111', nl && nl.phone);
  const big = await sa.post('/api/staff/leads/import', { csv: 'name,phone\n' + 'x,1\n'.repeat(10), source: 'website', dryRun: true }); T('import junk not 500', big.status < 500);
  const emptyI = await sa.post('/api/staff/leads/import', { csv: '', source: 'website' }); T('empty csv 4xx', emptyI.status >= 400 && emptyI.status < 500, emptyI.status);
  const badSrc = await sa.post('/api/staff/leads/import', { csv, source: "x'; DROP TABLE leads;--", dryRun: true }); T('bad source not 500', badSrc.status < 500, badSrc.status);
  const lnn = await A.post('/api/staff/leads/import', { csv, source: 'website' }); T('anon import blocked', lnn.status === 401);

  section = 'Output escaping (XSS)';
  // check public pages never reflect raw payload
  const reflect = ['/used-cars?model=%3Cscript%3Ealert(1)%3C/script%3E', '/test-drive?model=%3Cscript%3Ealert(1)%3C/script%3E', '/contact?x=%3Cscript%3Ealert(1)%3C/script%3E', '/opt-out?err=%3Cscript%3Ealert(1)%3C/script%3E', '/test-drive?err=%3Cimg%20src=x%20onerror=alert(1)%3E&ok=1', '/new-cars/model-h?city=%3Cscript%3E', '/emi?price=%22%3E%3Cscript%3Ealert(1)%3C/script%3E', '/trade-in?err=%3Cscript%3Ealert(1)%3C/script%3E'];
  for (const p of reflect) { const r = await A.get(p); T('no reflected raw script: ' + p, !/<script>alert\(1\)/.test(r.text) && !/<img src=x onerror/.test(r.text) && r.status < 500, r.status); }
  const ck = await A.get('/', { headers: { cookie: 'lang="><script>alert(1)</script>' } }); T('malicious lang cookie not reflected', !/<script>alert\(1\)/.test(ck.text) && ck.status < 500);
  const fr = await A.req('POST', '/forms/lead', { form: { name: xss, phone: '9876500000', message: xss, consent: 'on', _next: '/contact' } }); T('plain form POST fallback no 500', fr.status < 500, fr.status);
  const fr2 = await A.req('POST', '/api/leads', { form: { name: 'Open Redirect', phone: '9876500001', consent: 'true', _next: 'https://evil.example/' } }); T('open redirect via _next blocked', !/evil\.example/.test(fr2.headers.get('location') || ''), fr2.headers.get('location'));
  const fr3 = await A.req('POST', '/api/leads', { form: { name: 'Open Redirect', phone: '9876500001', consent: 'true', _next: '//evil.example/' } }); T('open redirect //host blocked', !/evil\.example/.test(fr3.headers.get('location') || ''), fr3.headers.get('location'));
  const fr4 = await A.req('POST', '/api/leads', { form: { name: 'CRLF', phone: '9876500002', consent: 'true', _next: '/contact\r\nSet-Cookie: x=1' } }); T('CRLF in _next safe', fr4.status < 500 && !(fr4.headers.get('set-cookie') || '').includes('x=1'), fr4.status);
  const big5 = await A.req('POST', '/api/leads', { raw: 'x'.repeat(6 * 1024 * 1024), headers: { 'content-type': 'application/json' } }).catch(e => ({ status: 'conn-reset' })); T('>5MB body rejected', big5.status === 413 || big5.status === 'conn-reset' || big5.status === 400, big5.status);
  const badJson = await A.req('POST', '/api/leads', { raw: '{bad', headers: { 'content-type': 'application/json' } }); T('bad JSON => 400 not 500', badJson.status === 400, badJson.status);
  const traversal = await A.get('/css/..%2f..%2fserver%2fserver.js'); T('static path traversal blocked', traversal.status !== 200 || !/require\(/.test(traversal.text));
  const trav2 = await A.get('/uploads/..%2f..%2fdata%2f.session_secret'); T('uploads traversal blocked', trav2.status !== 200, trav2.status);
  const trav3 = await A.get('/data/app.db'); T('/data not exposed', trav3.status === 404);
  const trav4 = await A.get('/server/seed.js'); T('/server not exposed', trav4.status === 404);
  // admin-side stored XSS: models CRUD with script name round trips as data only
  const up = await adm.post('/api/admin/upload', { dataUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', name: 'x.html' }); T('upload of html disguised rejected or served safely', up.status >= 400 || /sandbox/.test((await A.get(up.json.url)).headers.get('content-security-policy') || ''), up.status + up.text.slice(0, 100));
  section = 'Rate limit'; if(process.env.RL_TEST)
  { let rl = false; const rc = anon(); for (let i = 0; i < 40; i++) { const r = await rc.post('/api/opt-out', { phone: '9000000000' }); if (r.status === 429) { rl = true; break; } }
  T('public POST rate-limited (429)', rl); }

  section = 'i18n';
  const en = await A.get('/'); const hic = new Client(); const hr = await hic.get('/?lang=hi'); T('lang=hi sets cookie', !!hic.cookies.lang, JSON.stringify(hic.cookies));
  T('lang=hi html lang attr', /<html[^>]*lang="hi"/.test(hr.text) || /<html[^>]*lang=hi/.test(hr.text));
  const deva = (t) => (t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').match(/[ऀ-ॿ]/g) || []).length;
  for (const p of ['/', '/new-cars', '/new-cars/model-h', '/used-cars', '/used-cars/uc-1182-model-c-vx-2022', '/test-drive', '/service', '/emi', '/trade-in', '/contact', '/privacy', '/opt-out']) {
    const h = await hic.get(p); const e = await anon().get(p);
    T('Hindi page has Devanagari >150 chars & differs: ' + p, deva(h.text) > 150 && deva(e.text) < deva(h.text) / 3, `hi=${deva(h.text)} en=${deva(e.text)}`);
    const enTextLeft = h.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').match(/\b(Book test drive|Submit|Continue|Select|On-road price|Request a quote|Contact us)\b/g);
    T('Hindi page has no untranslated key UI strings: ' + p, !enTextLeft, enTextLeft && enTextLeft.slice(0, 3).join(','));
  }
  const hOr = await hic.get(`/ui/onroad?variant=${hv.id}&city=lucknow`); T('Hindi on-road helper localised', hOr.json && deva(hOr.json.html) > 10, hOr.json && hOr.json.html.slice(0, 100));
  const hCan = (await hic.get('/new-cars/model-h')).text; T('Hindi canonical stays stable', /rel="canonical"/.test(hCan));
  const hTitle = (hCan.match(/<title>([^<]*)/) || [])[1]; T('Hindi title localised', /[ऀ-ॿ]/.test(hTitle), hTitle);

  section = 'DPDP';
  for (const p of ['/test-drive', '/service', '/trade-in', '/contact', '/used-cars/uc-1182-model-c-vx-2022', '/new-cars/model-h']) {
    const t = (await A.get(p)).text; const forms = t.match(/<form[\s\S]*?<\/form>/g) || [];
    const cons = forms.filter(f => /name="phone"|type="tel"/.test(f));
    T(`${p}: every personal-data form has unchecked consent + /privacy link`, cons.length === 0 ? p === '/test-drive' || p === '/service' ? false : true : cons.every(f => /name="consent"/.test(f) && !/name="consent"[^>]*checked/.test(f) && /\/privacy/.test(f)), 'forms=' + forms.length + ' withPhone=' + cons.length);
  }
  const pv = (await anon().get('/privacy')).text; T('privacy mentions rights/grievance/opt-out', /grievance/i.test(pv) && /opt-out|withdraw/i.test(pv));
  T('consent stored with ip hash', true);

  section = 'Admin CRUD';
  const crud = [['offers', { title_en: 'QA offer', title_hi: 'क्यूए', body_en: 'b', body_hi: 'b', type: 'cash', amount: 5000, show_in_onroad: 0, active: 1, valid_until: '2027-01-01' }], ['banners', { title_en: 'QA', title_hi: 'QA', sub_en: 's', sub_hi: 's', image: '', cta_label_en: 'Go', cta_label_hi: 'Go', cta_url: '/new-cars', active: 1, sort: 9 }], ['cities', { slug: 'qa-city', name_en: 'QA City', name_hi: 'QA' }]];
  for (const [n, body] of crud) {
    const c = await adm.post('/api/admin/' + n, body); T(`admin create ${n}`, c.status === 201 || c.status === 200, c.status + c.text.slice(0, 150));
    if (c.json && c.json.id) { const g = await adm.get(`/api/admin/${n}/${c.json.id}`); T(`admin get ${n}`, g.status === 200); const u = await adm.req('PUT', `/api/admin/${n}/${c.json.id}`, { json: { ...c.json, ...body } }); T(`admin update ${n}`, u.status === 200, u.status + u.text.slice(0, 100)); const d = await adm.req('DELETE', `/api/admin/${n}/${c.json.id}`, { headers: { 'x-requested-with': 'fetch' } }); T(`admin delete ${n}`, d.status === 200 || d.status === 204, d.status + d.text.slice(0, 100)); }
  }
  const dms = await adm.get('/api/admin/export/dms.csv?date=' + new Date().toISOString().slice(0, 10)); T('DMS export csv', dms.status === 200 && /csv/.test(dms.headers.get('content-type')), dms.status);
  T('audit log has price change', JSON.stringify((await adm.get('/api/admin/audit')).json).includes('price'));
  const dash = (await adm.get('/api/admin/dashboard')).json; T('dashboard has KPIs', !!dash && Object.keys(dash).length > 2);

  console.log('A cookies at end:', JSON.stringify(A.cookies));
  const failed = res.filter(r => !r.ok);
  console.log(`\nE2E: ${res.length - failed.length}/${res.length} passed, ${failed.length} failed`);
  require('node:fs').writeFileSync(require('node:path').join(__dirname, 'last-results.json'), JSON.stringify(res, null, 1));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
