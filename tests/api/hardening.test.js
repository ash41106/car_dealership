'use strict';
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');
let t, ce, admin, used, priya, desk;
before(async () => {
  t = await start();
  ce = await t.login('content@companya.in', 'Content@123'); admin = await t.login('admin@companya.in', 'Admin@123');
  used = await t.login('used@companya.in', 'Used@123'); priya = await t.login('priya@companya.in', 'Sales@123'); desk = await t.login('desk@companya.in', 'Desk@123');
});
after(() => t.close());

test('R3-02: content editor cannot change any price-bearing field (PUT/POST), copy edits still work', async () => {
  const before = t.db.q.get('SELECT accessories_amount a FROM models WHERE id = 1').a;
  const put = (url, body, c = ce) => t.api('PUT', url, body, { cookie: c });
  assert.equal((await put('/api/admin/models/1', { accessories_amount: 1 })).status, 403);
  assert.equal(t.db.q.get('SELECT accessories_amount a FROM models WHERE id = 1').a, before);
  assert.equal((await put('/api/admin/models/1', { tagline_en: 'Editor copy', accessories_amount: before })).status, 200); // unchanged value is fine
  assert.equal((await t.api('POST', '/api/admin/models', { name: 'Model Z', accessories_amount: 5000 }, { cookie: ce })).status, 403);
  assert.equal((await put('/api/admin/offers/1', { amount: 77777 })).status, 403);
  assert.equal((await put('/api/admin/offers/1', { show_in_onroad: false })).status, 403);
  assert.equal((await put('/api/admin/offers/1', { type: 'info' })).status, 403);
  assert.equal((await put('/api/admin/offers/2', { type: 'info' })).status, 403); // changing a cash offer's nature
  assert.equal(t.db.q.get('SELECT amount FROM offers WHERE id = 1').amount, 15000);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'Cash', type: 'cash', amount: 1000 }, { cookie: ce })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'Cash0', type: 'cash' }, { cookie: ce })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'Free text offer', body_en: 'copy only' }, { cookie: ce })).status, 201);
  assert.equal((await put('/api/admin/offers/1', { title_en: 'Loyalty bonus (edited copy)' })).status, 200);
  assert.equal((await put('/api/admin/variants/1', { ex_showroom: 1 })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/variants', { model_id: 1, code: 'X', name: 'X', fuel: 'Petrol', transmission: 'Manual', ex_showroom: 1 }, { cookie: ce })).status, 403);
  assert.equal((await put('/api/admin/price-rules/1', { handling: 1 })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/price-rules', { city_id: 1, road_tax_pct: 1, road_tax_pct_high: 2 }, { cookie: ce })).status, 403);
  const car = t.db.q.get("SELECT id, price FROM used_cars WHERE stock_id = 'UC-1182'");
  for (const c of [ce, priya, desk]) assert.equal((await put(`/api/admin/used/${car.id}`, { price: 1000 }, c)).status, 403);
  assert.equal(t.db.q.get('SELECT price FROM used_cars WHERE id = ?', car.id).price, car.price);
  assert.equal((await put(`/api/admin/used/${car.id}`, { price: car.price + 1000 }, used)).status, 200);
  assert.equal((await put(`/api/admin/used/${car.id}`, { price: car.price }, admin)).status, 200);
  // PATCH is not an admin-entity method
  assert.notEqual((await t.api('PATCH', '/api/admin/models/1', { accessories_amount: 1 }, { cookie: ce })).status, 200);
  // admin can still change prices
  assert.equal((await put('/api/admin/models/1', { accessories_amount: before + 1 }, admin)).status, 200);
  assert.equal((await put('/api/admin/models/1', { accessories_amount: before }, admin)).status, 200);
});

test('R3-06: password policy (classes, name/email, common words, equals current)', async () => {
  const mk = pw => t.api('POST', '/api/admin/users', { name: 'Anita Desai', email: 'anita.d@companya.in', role: 'consultant', password: pw, showroom_id: 1 }, { cookie: admin });
  for (const bad of ['Short1!a', 'alllowercaseletters', 'ALLUPPER1234567', 'lowercase12345', 'Welcome@12345', 'Qwerty!Qwerty1', 'Companya#2024x', 'xx-anita.d-9Z!', 'Anita#Desai#99', 'Password#12345'])
    assert.equal((await mk(bad)).status, 422, bad);
  assert.equal((await mk('Tr0ub4dor&Horse')).status, 201);
  const c = await t.login('anita.d@companya.in', 'Tr0ub4dor&Horse');
  const chg = pw => t.api('POST', '/api/auth/change-password', { current_password: 'Tr0ub4dor&Horse', new_password: pw }, { cookie: c });
  assert.equal((await chg('Tr0ub4dor&Horse')).status, 422);
  assert.equal((await chg('onlylowerletters')).status, 422);
  assert.equal((await chg('Newpass#anita99')).status, 422);
  assert.equal((await chg('Gr33n&Purple!Sky')).status, 200);
  // generated temp passwords satisfy the policy
  const auth = require('../../server/lib/auth');
  for (let i = 0; i < 20; i++) auth.checkPolicy(auth.tempPassword(), {});
});

test('R3-12: only roles with lead.work are assignable', async () => {
  const lead = (await t.api('POST', '/api/leads', { name: 'Assign Test', phone: '9706000001', consent: true, showroomId: 1 })).json.lead;
  const adminId = t.db.q.get("SELECT id FROM users WHERE email = 'admin@companya.in'").id;
  const usedId = t.db.q.get("SELECT id FROM users WHERE email = 'used@companya.in'").id;
  const mgrId = t.db.q.get("SELECT id FROM users WHERE email = 'manager.gomti@companya.in'").id;
  const rahul = t.db.q.get("SELECT id FROM users WHERE email = 'rahul@companya.in'").id;
  for (const id of [adminId, usedId]) assert.equal((await t.api('POST', `/api/staff/leads/${lead.id}/reassign`, { user_id: id }, { cookie: desk })).status, 422);
  assert.equal((await t.api('POST', `/api/staff/leads/${lead.id}/reassign`, { user_id: t.db.q.get("SELECT id FROM users WHERE email = 'service@companya.in'").id }, { cookie: desk })).status, 422);
  assert.equal((await t.api('POST', `/api/staff/leads/${lead.id}/reassign`, { user_id: mgrId }, { cookie: desk })).status, 200);
  assert.equal((await t.api('POST', `/api/staff/leads/${lead.id}/reassign`, { user_id: rahul }, { cookie: desk })).status, 200);
  const list = (await t.api('GET', '/api/staff/consultants', undefined, { cookie: desk })).json;
  assert.ok(list.length >= 9 && list.every(u => ['consultant', 'showroom_manager'].includes(u.role)));
  const own = (await t.api('GET', '/api/staff/consultants', undefined, { cookie: await t.login('manager.gomti@companya.in', 'Manager@123') })).json;
  assert.ok(own.length >= 3 && own.every(u => u.showroom_id === 1));
  const perms = require('../../server/lib/perms');
  assert.equal(perms.can({ role: 'admin' }, 'lead.work'), false);
  assert.equal(perms.can({ role: 'consultant' }, 'lead.work'), true);
});

function gateway(handler) {
  return new Promise(res => { const srv = http.createServer(handler); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}/send` })); });
}
const env = (o, fn) => async () => {
  const saved = {}; for (const k of Object.keys(o)) { saved[k] = process.env[k]; if (o[k] === null) delete process.env[k]; else process.env[k] = o[k]; }
  try { await fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

test('production OTP: fail closed without a provider; never leaks dev_otp or accepts 123456', env({ NODE_ENV: 'production', MESSAGING_PROVIDER: null, MESSAGING_URL: null }, async () => {
  const r = await t.api('POST', '/api/customer/otp/request', { phone: '9807000001' });
  assert.equal(r.status, 503); assert.ok(!/dev_otp|123456/.test(r.text));
  assert.match(r.json.error, /temporarily unavailable/);
  assert.equal(t.db.q.get("SELECT COUNT(*) c FROM customer_otps WHERE phone = '9807000001'").c, 0);
  assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9807000001', otp: '123456' })).status, 400);
}));

test('production OTP via generic HTTP gateway: payload mapping, auth header, DLT ids, no dev_otp', async () => {
  const seen = [];
  const gw = await gateway((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { seen.push({ headers: req.headers, body: JSON.parse(b) }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ request_id: 'gw-1' })); }); });
  try {
    await env({ NODE_ENV: 'production', MESSAGING_PROVIDER: 'http', MESSAGING_URL: gw.url, MESSAGING_TOKEN: 'tok123', SENDER_ID: 'COMPAM', DLT_ENTITY_ID: 'E1', DLT_TEMPLATE_IDS: '{"otp":"T-OTP"}', MESSAGING_BODY_TEMPLATE: null }, async () => {
      const r = await t.api('POST', '/api/customer/otp/request', { phone: '9807000002' });
      assert.equal(r.status, 200); assert.equal(r.json.dev_otp, undefined); assert.ok(!/123456/.test(r.text));
      const g = seen[0];
      assert.equal(g.headers.authorization, 'Bearer tok123');
      assert.equal(g.body.to, '919807000002'); assert.equal(g.body.sender, 'COMPAM'); assert.equal(g.body.template_id, 'T-OTP'); assert.equal(g.body.entity_id, 'E1');
      const otp = g.body.message.match(/\b(\d{6})\b/)[1];
      assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9807000002', otp: '123456' })).status, 401);
      assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9807000002', otp })).status, 200);
      assert.equal(t.db.q.get("SELECT status FROM messages WHERE phone = '9807000002' AND template = 'otp'").status, 'sent');
      assert.ok(!t.db.q.get("SELECT body FROM messages WHERE phone = '9807000002' AND template = 'otp'").body.includes(otp));
    })();
    // custom body template + raw auth header
    await env({ NODE_ENV: 'production', MESSAGING_PROVIDER: 'http', MESSAGING_URL: gw.url, MESSAGING_TOKEN: 'k9', MESSAGING_AUTH_HEADER: 'authkey', MESSAGING_AUTH_SCHEME: '', DLT_TEMPLATE_IDS: '{"otp":"T2"}', MESSAGING_BODY_TEMPLATE: '{"template_id":"{{template_id}}","recipients":[{"mobiles":"{{to}}","otp":"{{otp}}"}]}' }, async () => {
      assert.equal((await t.api('POST', '/api/customer/otp/request', { phone: '9807000003' })).status, 200);
      const g = seen.at(-1);
      assert.equal(g.headers.authkey, 'k9'); assert.equal(g.body.template_id, 'T2'); assert.equal(g.body.recipients[0].mobiles, '919807000003'); assert.match(g.body.recipients[0].otp, /^\d{6}$/);
    })();
  } finally { gw.srv.close(); }
});

test('production OTP: gateway failure fails closed (502) and the OTP is unusable', async () => {
  const gw = await gateway((req, res) => { req.resume(); res.statusCode = 500; res.end('boom'); });
  try {
    await env({ NODE_ENV: 'production', MESSAGING_PROVIDER: 'http', MESSAGING_URL: gw.url }, async () => {
      const r = await t.api('POST', '/api/customer/otp/request', { phone: '9807000004' });
      assert.equal(r.status, 502); assert.ok(!/dev_otp/.test(r.text));
      assert.equal(t.db.q.get("SELECT COUNT(*) c FROM customer_otps WHERE phone = '9807000004' AND used = 0").c, 0);
    })();
    await env({ NODE_ENV: 'production', MESSAGING_PROVIDER: 'http', MESSAGING_URL: null }, async () => {
      assert.equal((await t.api('POST', '/api/customer/otp/request', { phone: '9807000005' })).status, 503);
    })();
  } finally { gw.srv.close(); }
});

test('public settings: site_stats and contact, anonymous + cacheable, admin-editable and audited', async () => {
  const r = await t.api('GET', '/api/settings/public');
  assert.equal(r.status, 200);
  assert.equal(r.json.site_stats.new_cars_per_year, 6000); assert.equal(r.json.site_stats.used_cars_per_year, 900);
  assert.ok(r.json.contact.phone && r.json.emi.rate > 0);
  assert.match(r.headers.get('cache-control'), /public, max-age=\d+/);
  const etag = r.headers.get('etag'); assert.ok(etag);
  const again = await fetch(t.base + '/api/settings/public', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  assert.ok(!/password|secret|token/i.test(r.text));
  assert.equal((await t.api('PUT', '/api/admin/settings', { site_stats: { new_cars_per_year: 6100, used_cars_per_year: 950 } }, { cookie: ce })).status, 403);
  assert.equal((await t.api('PUT', '/api/admin/settings', { site_stats: { new_cars_per_year: [1] } }, { cookie: admin })).status, 422);
  assert.equal((await t.api('PUT', '/api/admin/settings', { contact: 'not json' }, { cookie: admin })).status, 422);
  assert.equal((await t.api('PUT', '/api/admin/settings', { site_stats: { new_cars_per_year: 6100, used_cars_per_year: 950 }, contact: { phone: '0522 111111' } }, { cookie: admin })).status, 200);
  const after = (await t.api('GET', '/api/settings/public')).json;
  assert.equal(after.site_stats.new_cars_per_year, 6100); assert.equal(after.contact.phone, '0522 111111');
  assert.equal((await t.api('GET', '/api/admin/settings', undefined, { cookie: admin })).json.site_stats.used_cars_per_year, 950);
  assert.ok((await t.api('GET', '/api/admin/audit?limit=50', undefined, { cookie: admin })).json.some(a => a.entity === 'settings'));
});

test('R3-11: used-car colours match the photos and the seed fix-up is idempotent', async () => {
  const want = { 'UC-1182': 'White', 'UC-1190': 'White', 'UC-1191': 'Silver', 'UC-1192': 'Black', 'UC-1193': 'Midnight Blue', 'UC-1194': 'White', 'UC-1195': 'Pearl White', 'UC-1196': 'Black',
    'UC-1197': 'Graphite Grey', 'UC-1198': 'Silver', 'UC-1199': 'Blue', 'UC-1200': 'Red', 'UC-1201': 'Charcoal Grey', 'UC-1202': 'Slate Grey', 'UC-1203': 'Dark Blue' };
  const body = { 'UC-1191': 'Model C', 'UC-1192': 'Model H', 'UC-1193': 'Model H', 'UC-1194': 'Model S', 'UC-1195': 'Model V', 'UC-1196': 'Model S', 'UC-1197': 'Model V', 'UC-1198': 'Model V',
    'UC-1199': 'Model S', 'UC-1200': 'Model S', 'UC-1201': 'Model S', 'UC-1202': 'Model C', 'UC-1203': 'Model S' };
  for (const [id, m] of Object.entries(body)) assert.equal(t.db.q.get('SELECT model FROM used_cars WHERE stock_id = ?', id).model, m, id);
  const s182 = (await t.api('GET', '/api/used/UC-1182')).json, s190 = (await t.api('GET', '/api/used/UC-1190')).json;
  assert.deepEqual([s182.model, s182.variant, s182.fuel, s182.year, s182.km, s182.price, s182.status], ['Model C', 'VX', 'Diesel', 2022, 41200, 845000, 'available']);
  assert.deepEqual([s190.model, s190.variant, s190.fuel, s190.year, s190.km, s190.price, s190.status], ['Model S', 'LX', 'Petrol', 2021, 58600, 512000, 'booked']);
  for (const [id, c] of Object.entries(want)) assert.equal((await t.api('GET', '/api/used/' + id)).json.color, c, id);
  t.db.q.run("UPDATE used_cars SET color = 'Red' WHERE stock_id = 'UC-1182'");
  const seed = require('../../server/seed');
  seed.fixups(); seed.fixups();
  assert.equal((await t.api('GET', '/api/used/UC-1182')).json.color, 'White');
  assert.equal(seed.seed().skipped, true);
});
