'use strict';
// Round-3 RBAC / session / OTP / CSRF API checks. BASE_URL=http://localhost:3400 node tests/e2e/rbac.js
const BASE = (process.env.BASE_URL || 'http://localhost:3400').replace(/\/$/, '');
let pass = 0, fail = 0; const fails = [];
const T = (n, ok, info) => { if (ok) pass++; else { fail++; fails.push(n + ' => ' + String(info ?? '').slice(0, 250)); } };
const day = n => new Date(Date.now() + 86400000 * n).toISOString().slice(0, 10);
class C {
  constructor() { this.jar = {}; }
  async req(method, url, body, hdr = {}) {
    const h = { ...hdr }; if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    const ck = Object.entries(this.jar).map(([k, v]) => k + '=' + v).join('; '); if (ck) h.cookie = ck;
    const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), redirect: 'manual' });
    for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v || /max-age=0/i.test(sc)) delete this.jar[k]; else this.jar[k] = v; }
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch {}
    return { status: r.status, text, json, headers: r.headers };
  }
  get(u) { return this.req('GET', u); } post(u, b = {}) { return this.req('POST', u, b); } put(u, b = {}) { return this.req('PUT', u, b); } patch(u, b = {}) { return this.req('PATCH', u, b); } del(u) { return this.req('DELETE', u, undefined, { 'x-requested-with': 'fetch' }); }
  login(e, p) { return this.post('/api/auth/login', { email: e, password: p }); }
}
const USERS = {
  admin: ['admin@companya.in', 'Admin@123'], dealer_principal: ['principal@companya.in', 'Principal@123'], lead_desk: ['desk@companya.in', 'Desk@123'],
  showroom_manager: ['manager.gomti@companya.in', 'Manager@123'], consultant: ['priya@companya.in', 'Sales@123'], consultant2: ['neha@companya.in', 'Sales@123'],
  used_manager: ['used@companya.in', 'Used@123'], content_editor: ['content@companya.in', 'Content@123'], service_advisor: ['service@companya.in', 'Service@123'],
  service2: ['service2@companya.in', 'Service@123'], workshop_manager: ['wm.amausi@companya.in', 'Workshop@123'],
};
const U = c => c.me.user || c.me;
(async () => {
  const S = {}; for (const [k, [e, p]] of Object.entries(USERS)) { S[k] = new C(); const r = await S[k].login(e, p); T('login ' + k, r.status === 200, r.status + r.text); S[k].me = r.json; }
  console.log('login response keys', Object.keys(S.admin.me || {}).join(','));
  const pub = new C();
  const lead = await pub.post('/api/leads', { name: 'QA Lead', phone: '9811100001', model: 'Model H', city: 'lucknow', consent: true, source: 'website' });
  T('public lead create', lead.status === 201, lead.text);
  // dealer_principal: every mutating call 403
  const dp = S.dealer_principal;
  const muts = [
    ['PATCH', '/api/staff/leads/1', {}], ['POST', '/api/staff/leads/1/reassign', { consultant_id: 1 }], ['POST', '/api/staff/leads/1/reply', { text: 'hi', channel: 'whatsapp', confirmed_edit: true }], ['POST', '/api/staff/leads/1/ai', {}],
    ['POST', '/api/staff/leads/import', { csv: 'name,phone\na,9876500000', dryRun: false }], ['PATCH', '/api/staff/bookings/1', { status: 'confirmed' }], ['PATCH', '/api/staff/callbacks/1', { status: 'done' }], ['PATCH', '/api/staff/workshop', { bays: 1 }],
    ['PUT', '/api/admin/settings', { x: 1 }], ['POST', '/api/admin/upload', {}], ['PUT', '/api/admin/roles/consultant/permissions', { permissions: [] }], ['POST', '/api/admin/users/2/reset-password', {}], ['PATCH', '/api/admin/data-requests/1', { status: 'done' }],
    ...['models', 'variants', 'price-rules', 'cities', 'offers', 'banners', 'showrooms', 'workshops', 'demo-cars', 'users', 'used', 'past-sales'].flatMap(e => [['POST', '/api/admin/' + e, { name: 'x' }], ['PUT', '/api/admin/' + e + '/1', { name: 'x' }], ['DELETE', '/api/admin/' + e + '/1']]),
  ];
  const bad = []; for (const [m, u, b] of muts) { const r = await dp.req(m, u, b, { 'x-requested-with': 'fetch' }); if (r.status !== 403) bad.push(`${m} ${u}=${r.status}`); }
  T('dealer_principal 403 on all ' + muts.length + ' mutating calls', bad.length === 0, bad.join('; '));
  T('dealer_principal reads leads all', (await dp.get('/api/staff/leads')).status === 200);
  T('dealer_principal exec ok', (await dp.get('/api/exec/summary')).status === 200);
  const dpu = await dp.get('/api/admin/users'); T('dp users no password_hash', dpu.status === 200 && !/password_hash|scrypt/i.test(dpu.text));
  T('dp dms export read ok', (await dp.get('/api/admin/export/dms.csv')).status === 200);
  T('dp cannot see AI price band', (await dp.get('/api/admin/used/1/suggestion')).status === 403);
  const dpUsed = await dp.get('/api/admin/used/1'); T('dp used detail has no suggestion', dpUsed.status === 200 && !dpUsed.json.suggestion);
  // price band
  for (const k of ['admin', 'dealer_principal', 'lead_desk', 'showroom_manager', 'consultant', 'used_manager', 'content_editor', 'service_advisor', 'workshop_manager']) { const r = await S[k].get('/api/admin/used/1/suggestion'); const exp = ['admin', 'used_manager'].includes(k); T('AI band ' + k + (exp ? ' allowed' : ' denied'), exp ? r.status === 200 : r.status === 403, r.status); }
  const cu = await S.consultant.get('/api/used'); T('consultant public /api/used no suggestion', !/suggest|price_band/i.test(cu.text));
  // consultant scoping
  const allLeads = (await S.admin.get('/api/staff/leads?pageSize=100')).json; const items = allLeads.items || allLeads;
  const pri = U(S.consultant);
  const pl = (await S.consultant.get('/api/staff/leads?pageSize=100')).json; const pitems = pl.items || pl;
  T('consultant sees fewer leads than admin', pitems.length < items.length, pitems.length + '/' + items.length);
  const foreign = items.find(l => l.assigned_to !== pri.id && l.showroom_id !== pri.showroom_id);
  T('foreign lead found', !!foreign, 'none');
  if (foreign) {
    T('consultant GET other-showroom lead denied', [403, 404].includes((await S.consultant.get('/api/staff/leads/' + foreign.id)).status));
    const r = await S.consultant.patch('/api/staff/leads/' + foreign.id, { status: 'contacted' }); T('consultant PATCH foreign lead denied', [403, 404].includes(r.status), r.status);
    const r2 = await S.consultant.post('/api/staff/leads/' + foreign.id + '/reply', { text: 'hi', channel: 'whatsapp', confirmed_edit: true }); T('consultant reply foreign lead denied', [403, 404].includes(r2.status), r2.status);
    const r3 = await S.consultant.post('/api/staff/leads/' + foreign.id + '/reassign', { user_id: pri.id }); T('consultant reassign foreign lead to self denied', [403, 404, 422].includes(r3.status), r3.status);
  }
  T('consultant import 403', (await S.consultant.post('/api/staff/leads/import', { csv: 'name,phone\na,9876500000' })).status === 403);
  T('consultant /staff/import page 403', (await S.consultant.get('/staff/import')).status === 403);
  T('consultant admin api 403', (await S.consultant.get('/api/admin/users')).status === 403 && (await S.consultant.get('/api/admin/audit')).status === 403);
  // manager scope
  const mg = U(S.showroom_manager); const ml = (await S.showroom_manager.get('/api/staff/leads?pageSize=100')).json; const mi = ml.items || ml;
  T('manager sees only own showroom leads', mi.length > 0 && mi.every(l => l.showroom_id === mg.showroom_id), mi.filter(l => l.showroom_id !== mg.showroom_id).length + ' foreign');
  // lead desk
  const ld = S.lead_desk; const dl = (await ld.get('/api/staff/leads?pageSize=100')).json; T('lead_desk sees all', (dl.items || dl).length === items.length);
  T('lead_desk SLA monitor 200', (await ld.get('/api/staff/sla')).status === 200);
  const cons = await ld.get('/api/staff/consultants'); const cl = cons.json.items || cons.json; T('lead_desk consultants list', cons.status === 200 && cl.length >= 6, cl.length);
  const L = (lead.json.lead || lead.json); const target = cl.find(c => c.role === 'consultant' && c.id !== L.assigned_to) || cl[0];
  const ra = await ld.post('/api/staff/leads/' + L.id + '/reassign', { user_id: target.id }); T('lead_desk reassign', ra.status === 200, ra.status + ra.text.slice(0, 150));
  const chk = (await ld.get('/api/staff/leads/' + L.id)).json.lead; T('reassign took effect', (chk.assigned_to ?? chk.consultant_id) === target.id, JSON.stringify(chk).slice(0, 120));
  T('lead_desk import dry-run 200', (await ld.post('/api/staff/leads/import', { csv: 'name,phone\na,9876500000', dryRun: true })).status === 200);
  T('lead_desk cannot touch admin', (await ld.get('/api/admin/users')).status === 403 && (await ld.put('/api/admin/settings', {})).status === 403);
  T('lead_desk cannot see bookings', (await ld.get('/api/staff/bookings')).status === 403);
  // service
  const wss = (await pub.get('/api/workshops')).json;
  const mk = async (w, i) => { const d = day(4 + i); const ss = (await pub.get(`/api/slots/service?workshop=${w.id}&date=${d}`)).json; return pub.post('/api/service', { name: 'QA S', phone: '98111000' + (10 + i), regNo: 'UP32AB1234', model: 'Model H', workshopId: w.id, date: d, time: ss[0].time, serviceType: 'periodic', consent: true }); };
  const b1 = await mk(wss[0], 0), b2 = await mk(wss[1], 1); T('service bookings created', b1.status === 201 && b2.status === 201, b1.text.slice(0, 100) + b2.text.slice(0, 100));
  const bk1 = b1.json.booking.id, bk2 = b2.json.booking.id;
  const sb = (await S.service_advisor.get('/api/staff/bookings')).json; const sbi = sb.items || sb; const sau = U(S.service_advisor);
  const otherBk = sau.workshop_id === wss[0].id ? bk2 : bk1, ownBk = sau.workshop_id === wss[0].id ? bk1 : bk2;
  T('service_advisor list has own booking and not other workshop booking', sbi.some(b => b.id === ownBk) && !sbi.some(b => b.id === otherBk), JSON.stringify(sbi.map(b => [b.id, b.workshop_id])).slice(0, 200));
  T('service_advisor sees no test-drive bookings', sbi.every(b => b.type !== 'test_drive' && b.kind !== 'test_drive'), sbi.filter(b => b.type === 'test_drive').length);
  T('service_advisor cannot update other workshop booking', [403, 404].includes((await S.service_advisor.patch('/api/staff/bookings/' + otherBk, { status: 'confirmed' })).status));
  const upd2 = await S.service_advisor.patch('/api/staff/bookings/' + ownBk, { status: 'confirmed' }); T('service_advisor updates own booking', upd2.status === 200, upd2.status + upd2.text.slice(0, 100));
  T('service_advisor no lead access', (await S.service_advisor.get('/api/staff/leads')).status === 403);
  T('service_advisor no exec/admin', (await S.service_advisor.get('/api/exec/summary')).status === 403 && (await S.service_advisor.get('/api/admin/dashboard')).status === 403);
  const cb = await pub.post('/api/service/callback', { name: 'QA CB', phone: '9811100077', workshopId: wss[0].id, consent: true, reason: 'test' }); T('callback created', cb.status === 201, cb.text.slice(0, 150));
  T('service_advisor callbacks list', (await S.service_advisor.get('/api/staff/callbacks')).status === 200);
  T('workshop manage only workshop_manager', (await S.workshop_manager.get('/api/staff/workshop')).status === 200 && (await S.service_advisor.get('/api/staff/workshop')).status === 403);
  // content editor
  const ce = S.content_editor;
  const mods = (await ce.get('/api/admin/models')).json; T('content_editor reads models', Array.isArray(mods));
  T('content_editor cannot edit variants/price-rules', (await ce.put('/api/admin/variants/1', { ex_showroom: 1 })).status === 403 && (await ce.put('/api/admin/price-rules/1', { road_tax_pct: 0 })).status === 403);
  T('content_editor cannot touch used/users/settings', (await ce.get('/api/admin/used')).status === 403 && (await ce.get('/api/admin/users')).status === 403 && (await ce.put('/api/admin/settings', {})).status === 403);
  T('content_editor cannot see leads/bookings', (await ce.get('/api/staff/leads')).status === 403 && (await ce.get('/api/staff/bookings')).status === 403);
  const m0 = mods[0]; const before = (await ce.get('/api/admin/models/' + m0.id)).json.accessories_amount;
  const ac = await ce.put('/api/admin/models/' + m0.id, { accessories_amount: 1 }); const after = ac.status === 200 ? (await ce.get('/api/admin/models/' + m0.id)).json.accessories_amount : null;
  T('content_editor cannot change model accessories_amount (feeds on-road price)', ac.status === 403 || after === before, `status ${ac.status} ${before}->${after}`);
  if (after !== null && after !== before) await S.admin.put('/api/admin/models/' + m0.id, { accessories_amount: before });
  const offerBefore = (await ce.get('/api/admin/offers/1')).json; const eo = await ce.put('/api/admin/offers/1', { amount: 77777 });
  T('content_editor cannot change cash-offer amount (shown in on-road price)', eo.status === 403, 'status ' + eo.status + ' (offer amount ' + offerBefore.amount + ' -> 77777)');
  if (eo.status === 200) await S.admin.put('/api/admin/offers/1', { amount: offerBefore.amount });
  // used manager
  const um = S.used_manager; T('used_manager used list', (await um.get('/api/admin/used')).status === 200);
  T('used_manager no prices/users', (await um.put('/api/admin/price-rules/1', { road_tax_pct: 0 })).status === 403 && (await um.get('/api/admin/users')).status === 403);
  const ul = (await um.get('/api/staff/leads?pageSize=100')).json; const uli = ul.items || ul; console.log('used_manager lead sources', JSON.stringify([...new Set(uli.map(l => l.source))]), uli.length);
  console.log('used_manager audit status', (await um.get('/api/admin/audit')).status);
  // exec
  const ex = {}; for (const k of ['admin', 'dealer_principal', 'lead_desk', 'consultant', 'showroom_manager', 'used_manager']) ex[k] = (await S[k].get('/api/exec/summary')).status; T('exec only admin+principal', ex.admin === 200 && ex.dealer_principal === 200 && ['lead_desk', 'consultant', 'showroom_manager', 'used_manager'].every(k => ex[k] === 403), JSON.stringify(ex));
  // page matrix
  const pages = ['/staff/leads', '/staff/desk', '/staff/service', '/staff/bookings', '/staff/import', '/exec', '/admin', '/admin/used', '/admin/models', '/admin/prices', '/admin/offers', '/admin/banners', '/admin/showrooms', '/admin/users', '/admin/roles', '/admin/audit'];
  console.log('PAGE MATRIX', pages.join(' ')); for (const k of ['admin', 'dealer_principal', 'lead_desk', 'showroom_manager', 'consultant', 'used_manager', 'content_editor', 'service_advisor', 'workshop_manager']) { const row = []; for (const p of pages) row.push((await S[k].get(p)).status); console.log(k.padEnd(18), row.join(' ')); }
  // role matrix edit
  const rolesR = await S.admin.get('/api/admin/roles'); const roles = rolesR.json.roles || rolesR.json; const ceR = roles.find(r => r.name === 'content_editor'); const origPerms = ceR.permissions;
  const edit = await S.admin.put('/api/admin/roles/content_editor/permissions', { permissions: origPerms.filter(p => p !== 'content.banners') }); T('admin edits role', edit.status === 200, edit.status + edit.text.slice(0, 100));
  T('role edit effective immediately (live session)', (await ce.put('/api/admin/banners/1', { title_en: 'x' })).status === 403);
  await S.admin.put('/api/admin/roles/content_editor/permissions', { permissions: origPerms });
  const audit = (await S.admin.get('/api/admin/audit?limit=100')).json; const ai = audit.items || audit; T('role edit audited', ai.some(a => /role/i.test(a.action + a.entity)), JSON.stringify(ai.slice(0, 3)).slice(0, 200));
  const lock = await S.admin.put('/api/admin/roles/admin/permissions', { permissions: [] }); T('admin cannot strip own permissions', (await S.admin.get('/api/admin/roles')).status === 200 && (await S.admin.get('/api/admin/users')).status === 200, lock.status);
  T('unknown role/perm rejected', (await S.admin.put('/api/admin/roles/nope/permissions', { permissions: [] })).status >= 400 && (await S.admin.put('/api/admin/roles/consultant/permissions', { permissions: ['evil.perm'] })).status >= 400);
  // sessions
  const a2 = new C(); await a2.login(...USERS.used_manager); T('2nd session works', (await a2.get('/api/me')).status === 200);
  const oldCookie = { ...a2.jar }; await a2.post('/api/auth/logout'); const ghost = new C(); ghost.jar = oldCookie; T('logout kills token server-side (replay 401)', (await ghost.get('/api/me')).status === 401);
  const v = new C(); await v.login(...USERS.service2); const v2 = new C(); await v2.login(...USERS.service2); await v.post('/api/auth/revoke-all'); T('revoke-all kills the other live session', (await v2.get('/api/me')).status === 401);
  const un = await S.admin.post('/api/admin/users', { name: 'QA Tmp', email: 'qa.tmp@companya.in', role: 'consultant', showroom_id: 1, password: 'TempPass#2024', phone: '9811100099' }); T('admin create user', un.status === 201, un.status + un.text.slice(0, 150));
  const tu = new C(); const tl = await tu.login('qa.tmp@companya.in', 'TempPass#2024'); console.log('new user login', tl.status, JSON.stringify(tl.json).slice(0, 160));
  const uid = (un.json && (un.json.id || (un.json.user && un.json.user.id)));
  T('live', (await tu.get('/api/me')).status === 200);
  const de = await S.admin.put('/api/admin/users/' + uid, { active: false }); T('admin deactivate', de.status === 200, de.status + de.text.slice(0, 100)); T('deactivate kills live session', (await tu.get('/api/me')).status === 401);
  T('deactivated cannot login', (await new C().login('qa.tmp@companya.in', 'TempPass#2024')).status >= 400);
  await S.admin.put('/api/admin/users/' + uid, { active: true });
  const tu2 = new C(); await tu2.login('qa.tmp@companya.in', 'TempPass#2024'); await S.admin.put('/api/admin/users/' + uid, { role: 'content_editor' }); T('role change kills live session', (await tu2.get('/api/me')).status === 401);
  const rp = await S.admin.post('/api/admin/users/' + uid + '/reset-password'); console.log('reset-password response', rp.status, rp.text.slice(0, 160)); const tmp = rp.json && (rp.json.temp_password || rp.json.password || rp.json.tempPassword || rp.json.temporary_password);
  T('reset returns temp password', !!tmp, rp.text.slice(0, 120));
  let tmp2; if (tmp) {
    const f = new C(); const fl = await f.login('qa.tmp@companya.in', tmp); T('login with temp', fl.status === 200, fl.status);
    console.log('forced flag in login response', JSON.stringify(fl.json).slice(0, 200));
    const blocked = await f.get('/api/admin/models'); T('forced-change blocks other APIs (403 password_change_required)', blocked.status === 403 && /password_change_required/.test(blocked.text), blocked.status + blocked.text.slice(0, 100));
    T('/api/me still works', (await f.get('/api/me')).status === 200);
    const pol = {}; for (const [n, pw] of [['short', 'Ab1!'], ['same-as-old', tmp], ['email', 'qa.tmp@companya.in'], ['common', 'Password123']]) pol[n] = (await f.post('/api/auth/change-password', { current_password: tmp, new_password: pw })).status; pol.lowercaseOnly12 = (await f.post('/api/auth/change-password', { current_password: tmp, new_password: 'abcdefghijkl' })).status; tmp2 = pol.lowercaseOnly12 === 200 ? 'abcdefghijkl' : tmp;
    console.log('password policy statuses', JSON.stringify(pol));
    T('short pw rejected', pol.short >= 400, pol.short); T('same-as-current rejected', pol['same-as-old'] >= 400, pol['same-as-old']);
    T('wrong current pw rejected', (await f.post('/api/auth/change-password', { current_password: 'wrong', new_password: 'GoodPass#2024x' })).status >= 400);
    const ok = await f.post('/api/auth/change-password', { current_password: tmp2, new_password: 'GoodPass#2024x' }); T('valid change ok', ok.status === 200, ok.status + ok.text.slice(0, 100));
    T('after change, APIs unblocked', (await f.get('/api/staff/leads')).status === 200 || (await f.get('/api/admin/models')).status === 200);
    T('old pw no longer works', (await new C().login('qa.tmp@companya.in', tmp)).status >= 400);
  }
  // brute force lock
  const bf = new C(); const codes = []; for (let i = 0; i < 7; i++) codes.push((await bf.login('rahul@companya.in', 'bad' + i)).status); T('login lock after 5 fails -> 429', codes.includes(429), codes.join(','));
  console.log('login lock codes', codes.join(','), 'correct pw while locked ->', (await new C().login('rahul@companya.in', 'Sales@123')).status);
  // CSRF
  const r1 = await S.consultant.req('PATCH', '/api/staff/leads/' + L.id, '{"status":"contacted"}', { 'content-type': 'text/plain' }); T('CSRF: text/plain staff PATCH blocked', r1.status === 403, r1.status);
  console.log('logout via form post', (await S.admin.req('POST', '/api/auth/logout', 'a=b', { 'content-type': 'application/x-www-form-urlencoded' })).status);
  // customer OTP
  const ph = '9822200001'; const cu1 = new C();
  const o = await cu1.post('/api/customer/otp/request', { phone: ph }); T('otp request', o.status === 200, o.text); T('dev_otp present in mock mode', !!(o.json && o.json.dev_otp), o.text);
  const wrong = []; for (let i = 0; i < 6; i++) wrong.push((await cu1.post('/api/customer/otp/verify', { phone: ph, otp: '00000' + i })).status); console.log('otp wrong attempts', wrong.join(','));
  T('OTP wrong attempts rejected', wrong.every(s => s >= 400));
  const good = await cu1.post('/api/customer/otp/verify', { phone: ph, otp: '123456' }); console.log('otp correct after 6 wrong ->', good.status, good.text.slice(0, 100)); T('OTP locked after 5 wrong tries (correct code refused)', good.status >= 400, good.status);
  const rl = []; const cu2 = new C(); for (let i = 0; i < 5; i++) rl.push((await cu2.post('/api/customer/otp/request', { phone: '9822200002' })).status); T('OTP request rate limit 3/10min -> 429', rl.includes(429), rl.join(','));
  const cA = new C(); await cA.post('/api/customer/otp/request', { phone: '9822200003' }); const v3 = await cA.post('/api/customer/otp/verify', { phone: '9822200003', otp: '123456' }); T('customer login', v3.status === 200, v3.text.slice(0, 100));
  T('customer /api/customer/me', (await cA.get('/api/customer/me')).status === 200);
  for (const u of ['/api/staff/leads', '/api/staff/bookings', '/api/exec/summary', '/api/admin/users', '/api/admin/dashboard', '/api/staff/sla', '/api/staff/callbacks', '/api/me']) T('customer cookie blocked from ' + u, [401, 403].includes((await cA.get(u)).status), u);
  T('customer cannot POST staff', [401, 403].includes((await cA.post('/api/staff/leads/1/reply', { text: 'x' })).status));
  T('customer /staff/leads page not 200', (await cA.get('/staff/leads')).status !== 200);
  for (const k of ['admin', 'consultant']) T(k + ' staff cookie blocked from customer API', [401, 403].includes((await S[k].get('/api/customer/me')).status));
  T('customer CSRF text/plain blocked', (await cA.req('POST', '/api/customer/vehicles', '{}', { 'content-type': 'text/plain' })).status === 403);
  const cB = new C(); await cB.post('/api/customer/otp/request', { phone: '9822200004' }); await cB.post('/api/customer/otp/verify', { phone: '9822200004', otp: '123456' });
  const av = await cA.post('/api/customer/vehicles', { reg_no: 'UP32AB9999', model: 'Model H', year: 2020 }); T('add vehicle', av.status === 201, av.status + av.text.slice(0, 120));
  const vid = av.json && (av.json.id || (av.json.vehicle && av.json.vehicle.id)); if (vid) { T('B cannot edit A vehicle', [403, 404].includes((await cB.put('/api/customer/vehicles/' + vid, { model: 'X' })).status)); T('B cannot delete A vehicle', [403, 404].includes((await cB.del('/api/customer/vehicles/' + vid)).status)); }
  const bk = await cA.post('/api/test-drive', { name: 'Cust A', phone: '9822200003', modelId: 1, showroomId: 1, date: day(5), time: '11:00', consent: true }); console.log('test-drive as customer', bk.status, bk.text.slice(0, 160));
  const myb = (await cA.get('/api/customer/bookings')).json; const mb = (myb.items || myb.bookings || myb); const first = Array.isArray(mb) ? mb[0] : null;
  T('booking visible in account', !!first, JSON.stringify(myb).slice(0, 100));
  if (first) { T('B cannot cancel A booking', [403, 404].includes((await cB.post('/api/customer/bookings/' + first.id + '/cancel')).status)); const cn = await cA.post('/api/customer/bookings/' + first.id + '/cancel'); T('A cancels own booking', cn.status === 200, cn.status + cn.text.slice(0, 100)); T('cancel twice not 500', (await cA.post('/api/customer/bookings/' + first.id + '/cancel')).status < 500); }
  const sv = await cA.post('/api/customer/saved', { kind: 'new', ref: 'model-h' }); T('saved car', sv.status < 300, sv.status + sv.text.slice(0, 100));
  const ex2 = await cA.get('/api/customer/export'); T('data export attachment + only own data', ex2.status === 200 && /attachment/.test(ex2.headers.get('content-disposition') || '') && !/9822200004/.test(ex2.text), ex2.status);
  const dr = await cA.post('/api/customer/data-request', { type: 'delete' }); console.log('data request', dr.status, dr.text.slice(0, 120));
  const wd = await cA.patch('/api/customer/me', { marketing_consent: false }); console.log('withdraw consent via patch', wd.status, wd.text.slice(0, 160));
  await cA.post('/api/customer/logout'); T('customer logout kills session', (await cA.get('/api/customer/me')).status === 401);
  console.log(`\nRBAC: ${pass} pass / ${fail} fail`); fails.forEach(f => console.log('FAIL', f));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
