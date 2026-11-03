'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, futureDate } = require('./_helper');
let t, C = {};
const LOGINS = {
  admin: ['admin@companya.in', 'Admin@123'], dealer_principal: ['principal@companya.in', 'Principal@123'], lead_desk: ['desk@companya.in', 'Desk@123'],
  showroom_manager: ['manager.gomti@companya.in', 'Manager@123'], consultant: ['priya@companya.in', 'Sales@123'], service_advisor: ['service@companya.in', 'Service@123'],
  workshop_manager: ['wm.amausi@companya.in', 'Workshop@123'], used_manager: ['used@companya.in', 'Used@123'], content_editor: ['content@companya.in', 'Content@123'],
};
before(async () => {
  t = await start();
  for (const [r, [e, p]] of Object.entries(LOGINS)) C[r] = await t.login(e, p);
  C.customer = await t.customer('9800000099');
});
after(() => t.close());

const fill = p => p.replace(':id', '1').replace(':slug', 'model-h').replace(':role', 'consultant').replace(':file', 'x.svg');
// Documented exceptions where an allowed role legitimately gets a different (still non-401/403) status
const SCOPED = new Set(['/api/staff/leads/:id', '/api/staff/bookings/:id', '/api/staff/callbacks/:id']);

test('every /api route declares its permission', () => {
  const api = t.app.router.routes.filter(r => r.pattern.startsWith('/api/') || r.pattern === '/healthz');
  assert.ok(api.length > 80);
  const missing = api.filter(r => r.perm === undefined).map(r => r.method + ' ' + r.pattern);
  assert.deepEqual(missing, []);
  const perms = require('../../server/lib/perms');
  for (const r of api) for (const p of [].concat(r.perm)) assert.ok(['public', 'authenticated'].includes(p) || perms.PERMS[p], `unknown permission ${p} on ${r.pattern}`);
});

test('role x endpoint matrix: exact 401 / 403 / allowed', async () => {
  const perms = require('../../server/lib/perms');
  const routes = t.app.router.routes.filter(r => r.pattern.startsWith('/api/') && r.perm !== 'public');
  let checked = 0;
  for (const r of routes) {
    const url = fill(r.pattern);
    const isGet = r.method === 'GET';
    const body = isGet ? undefined : {};
    const custRoute = [].concat(r.perm).every(p => p.startsWith('customer.'));
    // anonymous
    assert.equal((await t.api(r.method, url, body)).status, 401, `anon ${r.method} ${r.pattern}`); checked++;
    for (const role of Object.keys(LOGINS)) {
      const allowed = r.perm === 'authenticated' ? true : custRoute ? false : perms.can({ role }, r.perm);
      if (!isGet && allowed && !custRoute) continue; // never execute allowed mutations (would change data)
      const res = await t.api(r.method, url, body, { cookie: C[role] });
      if (custRoute) assert.equal(res.status, 401, `${role} must not reach customer route ${r.method} ${r.pattern}`);
      else if (!allowed) assert.equal(res.status, 403, `${role} ${r.method} ${r.pattern}`);
      else if (isGet) {
        if (SCOPED.has(r.pattern)) assert.ok([200, 403, 404].includes(res.status), `${role} ${r.pattern} -> ${res.status}`);
        else if (r.pattern === '/api/staff/workshop') assert.equal(res.status, role === 'workshop_manager' ? 200 : 404, `${role} ${r.pattern}`);
        else if (r.pattern.includes(':')) assert.ok([200, 404].includes(res.status), `${role} ${r.method} ${r.pattern} -> ${res.status}`);
        else assert.equal(res.status, 200, `${role} GET ${r.pattern} -> ${res.status} ${res.text.slice(0, 100)}`);
      }
      checked++;
    }
    // customer session can never reach staff endpoints
    if (!custRoute) assert.equal((await t.api(r.method, url, body, { cookie: C.customer })).status, 401, `customer on ${r.method} ${r.pattern}`);
  }
  assert.ok(checked > 500);
});

test('customer cookie only works on customer routes; staff cookie does not work there', async () => {
  assert.equal((await t.api('GET', '/api/customer/me', undefined, { cookie: C.customer })).status, 200);
  assert.equal((await t.api('GET', '/api/customer/me', undefined, { cookie: C.admin })).status, 401);
  // a customer token presented as a staff cookie is not accepted
  const tok = C.customer.split('=')[1];
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: 'sid=' + tok })).status, 401);
});

test('dealer principal is strictly read-only and cannot see the AI price suggestion', async () => {
  const perms = require('../../server/lib/perms');
  const writes = [...perms.permsOf('dealer_principal')].filter(p => /(write|manage|update|reply|import|reassign|upload|reset_password|price_suggestion)/.test(p));
  assert.deepEqual(writes, []);
  const car = t.db.q.get("SELECT id FROM used_cars WHERE stock_id = 'UC-1182'");
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}`, undefined, { cookie: C.dealer_principal })).json.suggestion, undefined);
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}/suggestion`, undefined, { cookie: C.dealer_principal })).status, 403);
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}/suggestion`, undefined, { cookie: C.consultant })).status, 403);
  assert.ok((await t.api('GET', `/api/admin/used/${car.id}`, undefined, { cookie: C.used_manager })).json.suggestion.comps > 0);
  for (const [m, u] of [['PATCH', '/api/staff/leads/1'], ['PUT', '/api/admin/price-rules/1'], ['DELETE', '/api/admin/users/2'], ['POST', '/api/admin/offers']])
    assert.equal((await t.api(m, u, {}, { cookie: C.dealer_principal })).status, 403, m + u);
  const sum = await t.api('GET', '/api/exec/summary', undefined, { cookie: C.dealer_principal });
  assert.equal(sum.status, 200);
  assert.equal((await t.api('GET', '/api/admin/audit', undefined, { cookie: C.dealer_principal })).status, 200);
});

test('content editor edits copy/offers/banners but not prices, users or leads', async () => {
  assert.equal((await t.api('POST', '/api/admin/banners', { title_en: 'Editor banner' }, { cookie: C.content_editor })).status, 201);
  assert.equal((await t.api('PUT', '/api/admin/models/1', { tagline_en: 'New tagline' }, { cookie: C.content_editor })).status, 200);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'Editor offer' }, { cookie: C.content_editor })).status, 201);
  assert.equal((await t.api('PUT', '/api/admin/variants/1', { ex_showroom: 1 }, { cookie: C.content_editor })).status, 403);
  assert.equal((await t.api('PUT', '/api/admin/price-rules/1', { handling: 1 }, { cookie: C.content_editor })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/price-rules', undefined, { cookie: C.content_editor })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/users', undefined, { cookie: C.content_editor })).status, 403);
  assert.equal((await t.api('GET', '/api/staff/leads', undefined, { cookie: C.content_editor })).status, 403);
});

test('lead desk: all showrooms, assign/import; cannot edit prices or users', async () => {
  const mk = (sr, i) => t.api('POST', '/api/leads', { name: 'Scope Person ' + i, phone: '9701000' + String(100 + i), consent: true, showroomId: sr });
  const srs = (await t.api('GET', '/api/showrooms')).json;
  for (let i = 0; i < srs.length; i++) await mk(srs[i].id, i);
  const list = (await t.api('GET', '/api/staff/leads?pageSize=100', undefined, { cookie: C.lead_desk })).json;
  assert.equal(new Set(list.items.map(l => l.showroom_id)).size, 3);
  assert.equal((await t.api('PUT', '/api/admin/price-rules/1', { handling: 1 }, { cookie: C.lead_desk })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/users', {}, { cookie: C.lead_desk })).status, 403);
  const lead = list.items.find(l => l.showroom_id === srs[0].id);
  const neha = t.db.q.get("SELECT id FROM users WHERE email = 'neha@companya.in'").id;
  assert.equal((await t.api('POST', `/api/staff/leads/${lead.id}/reassign`, { user_id: neha, reason: 'desk' }, { cookie: C.lead_desk })).status, 200);
});

test('showroom manager: own showroom only; reassign within showroom; team stats', async () => {
  const srs = (await t.api('GET', '/api/showrooms')).json;
  const gomti = srs.find(s => s.slug === 'gomti-nagar'), aliganj = srs.find(s => s.slug === 'aliganj');
  const g = await t.api('POST', '/api/leads', { name: 'Gomti Lead', phone: '9702000001', consent: true, showroomId: gomti.id });
  const a = await t.api('POST', '/api/leads', { name: 'Aliganj Lead', phone: '9702000002', consent: true, showroomId: aliganj.id });
  const list = (await t.api('GET', '/api/staff/leads?pageSize=100', undefined, { cookie: C.showroom_manager })).json;
  assert.ok(list.items.length > 5 && list.items.every(l => l.showroom_id === gomti.id));
  assert.equal((await t.api('GET', `/api/staff/leads/${a.json.lead.id}`, undefined, { cookie: C.showroom_manager })).status, 403);
  assert.equal((await t.api('GET', `/api/staff/leads/${g.json.lead.id}`, undefined, { cookie: C.showroom_manager })).status, 200);
  const rahul = t.db.q.get("SELECT id FROM users WHERE email = 'rahul@companya.in'").id;
  const neha = t.db.q.get("SELECT id FROM users WHERE email = 'neha@companya.in'").id;
  assert.equal((await t.api('POST', `/api/staff/leads/${g.json.lead.id}/reassign`, { user_id: rahul }, { cookie: C.showroom_manager })).status, 200);
  assert.equal((await t.api('POST', `/api/staff/leads/${g.json.lead.id}/reassign`, { user_id: neha }, { cookie: C.showroom_manager })).status, 403);
  const st = (await t.api('GET', '/api/staff/leads/stats', undefined, { cookie: C.showroom_manager })).json;
  assert.ok(st.per_consultant.length >= 1 && st.total === list.total);
  assert.equal((await t.api('POST', '/api/staff/leads/import', { csv: 'name,phone\nA B,9811111111' }, { cookie: C.showroom_manager })).status, 403);
});

test('service advisor / workshop manager see only their workshop; workshop manager manages bays', async () => {
  const date = futureDate(9);
  const ws = (await t.api('GET', '/api/workshops')).json;
  const am = ws.find(w => w.slug === 'amausi'), gx = ws.find(w => w.slug === 'gomti-nagar-extension');
  const book = (w, i) => t.api('POST', '/api/service', { name: 'Svc Person', phone: '9703000' + String(100 + i), consent: true, regNo: 'UP32ZZ' + (4000 + i), workshopId: w.id, date, time: '09:00', serviceType: 'periodic' });
  const b1 = (await book(am, 1)).json.booking, b2 = (await book(gx, 2)).json.booking;
  const advA = (await t.api('GET', '/api/staff/bookings', undefined, { cookie: C.service_advisor })).json;
  assert.ok(advA.length && advA.every(b => b.type === 'service' && b.workshop_id === am.id));
  const wm = (await t.api('GET', '/api/staff/bookings', undefined, { cookie: C.workshop_manager })).json;
  assert.ok(wm.length === advA.length && wm.every(b => b.workshop_id === am.id));
  assert.equal((await t.api('PATCH', `/api/staff/bookings/${b2.id}`, { status: 'checked_in' }, { cookie: C.service_advisor })).status, 403);
  assert.equal((await t.api('PATCH', `/api/staff/bookings/${b1.id}`, { status: 'checked_in' }, { cookie: C.service_advisor })).status, 200);
  const cons = (await t.api('GET', '/api/staff/bookings', undefined, { cookie: C.consultant })).json;
  assert.ok(cons.every(b => b.type === 'test_drive'));
  assert.equal((await t.api('PATCH', '/api/staff/workshop', { bays: 3 }, { cookie: C.service_advisor })).status, 403);
  const up = await t.api('PATCH', '/api/staff/workshop', { bays: 3 }, { cookie: C.workshop_manager });
  assert.equal(up.status, 200); assert.equal(up.json.bays, 3);
  assert.equal((await t.api('PATCH', '/api/staff/workshop', { bays: 0 }, { cookie: C.workshop_manager })).status, 422);
  assert.equal((await t.api('GET', `/api/slots/service?workshop=${am.id}&date=${date}`)).json[0].capacity, 3);
  const audit = (await t.api('GET', '/api/admin/audit?limit=100', undefined, { cookie: C.admin })).json;
  assert.ok(audit.some(a => a.entity === 'workshops' && a.action === 'update'));
});

test('role permission matrix is editable by admin only, audited, effective immediately; admin role is fixed', async () => {
  const roles = await t.api('GET', '/api/admin/roles', undefined, { cookie: C.admin });
  assert.equal(roles.status, 200);
  assert.deepEqual(roles.json.roles.map(r => r.name).sort(), ['admin', 'consultant', 'content_editor', 'customer', 'dealer_principal', 'lead_desk', 'service_advisor', 'showroom_manager', 'used_manager', 'workshop_manager']);
  const ce = roles.json.roles.find(r => r.name === 'content_editor').permissions;
  assert.equal((await t.api('PUT', '/api/admin/roles/content_editor/permissions', { permissions: ce }, { cookie: C.consultant })).status, 403);
  assert.equal((await t.api('PUT', '/api/admin/roles/content_editor/permissions', { permissions: ['nope.perm'] }, { cookie: C.admin })).status, 422);
  assert.equal((await t.api('PUT', '/api/admin/roles/admin/permissions', { permissions: [] }, { cookie: C.admin })).status, 422);
  const without = ce.filter(p => p !== 'content.banners');
  assert.equal((await t.api('PUT', '/api/admin/roles/content_editor/permissions', { permissions: without }, { cookie: C.admin })).status, 200);
  assert.equal((await t.api('POST', '/api/admin/banners', { title_en: 'Blocked now' }, { cookie: C.content_editor })).status, 403);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: C.content_editor })).json.permissions.includes('content.banners'), false);
  assert.equal((await t.api('PUT', '/api/admin/roles/content_editor/permissions', { permissions: ce }, { cookie: C.admin })).status, 200);
  assert.equal((await t.api('POST', '/api/admin/banners', { title_en: 'Allowed again' }, { cookie: C.content_editor })).status, 201);
  const audit = (await t.api('GET', '/api/admin/audit?limit=100', undefined, { cookie: C.admin })).json;
  assert.ok(audit.some(a => a.entity === 'roles' && a.action === 'update_permissions' && JSON.stringify(a.detail).includes('content.banners')));
});
