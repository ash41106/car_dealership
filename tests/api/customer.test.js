'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, futureDate } = require('./_helper');
let t;
before(async () => { t = await start(); });
after(() => t.close());

test('OTP: request returns dev_otp in mock mode, verify logs in, 6 digits hashed in DB', async () => {
  const r = await t.api('POST', '/api/customer/otp/request', { phone: '+91 98000-00001' });
  assert.equal(r.status, 200); assert.match(r.json.dev_otp, /^\d{6}$/); assert.equal(r.json.expires_in, 300);
  const row = t.db.q.get("SELECT * FROM customer_otps WHERE phone = '9800000001' ORDER BY id DESC");
  assert.ok(row.otp_hash.length === 64 && !row.otp_hash.includes(r.json.dev_otp));
  const msg = t.db.q.get("SELECT body FROM messages WHERE phone = '9800000001' AND template = 'otp'");
  assert.ok(msg && !msg.body.includes(r.json.dev_otp));
  const v = await t.api('POST', '/api/customer/otp/verify', { phone: '9800000001', otp: r.json.dev_otp, name: 'Otp Person' });
  assert.equal(v.status, 200); assert.equal(v.json.customer.name, 'Otp Person');
  assert.match(v.headers.get('set-cookie'), /^cs=.*HttpOnly/);
  // OTP is single-use
  assert.equal(t.db.q.get('SELECT used FROM customer_otps WHERE id = ?', row.id).used, 1);
  assert.equal((await t.api('POST', '/api/customer/otp/request', { phone: '12345' })).status, 422);
});

test('OTP: max 5 wrong attempts, expiry, request rate limit; real mode has no fixed OTP', async () => {
  process.env.OTP_MODE = 'real';
  try {
    const r = await t.api('POST', '/api/customer/otp/request', { phone: '9800000002' });
    assert.equal(r.json.dev_otp, undefined);
    assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9800000002', otp: '123456' })).status, 401); // fixed OTP rejected
    for (let i = 0; i < 4; i++) assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9800000002', otp: '111111' })).status, 401);
    const locked = await t.api('POST', '/api/customer/otp/verify', { phone: '9800000002', otp: '222222' });
    assert.equal(locked.status, 429);
    // expiry
    t.db.q.run("UPDATE customer_otps SET attempts = 0, expires_at = ? WHERE phone = '9800000002'", new Date(Date.now() - 1000).toISOString());
    assert.equal((await t.api('POST', '/api/customer/otp/verify', { phone: '9800000002', otp: '333333' })).status, 400);
    // rate limit: 3 per 10 minutes per phone
    const rs = [];
    for (let i = 0; i < 4; i++) rs.push((await t.api('POST', '/api/customer/otp/request', { phone: '9800000003' })).status);
    assert.deepEqual(rs, [200, 200, 200, 429]);
  } finally { delete process.env.OTP_MODE; }
  // mock mode: fixed OTP works for any number
  assert.ok(await t.customer('9800000004', '123456'));
});

test('customer profile, bookings auto-linked by phone, enquiries, form prefill + linking', async () => {
  const c = await t.customer('9800000010');
  assert.equal((await t.api('PATCH', '/api/customer/me', { name: 'Kiran Rao', email: 'kiran@example.com', lang: 'hi' }, { cookie: c })).json.customer.lang, 'hi');
  assert.equal((await t.api('PATCH', '/api/customer/me', { email: 'bad' }, { cookie: c })).status, 422);
  // anonymous booking with the same phone shows up
  const ws = (await t.api('GET', '/api/workshops')).json[0];
  const date = futureDate(10);
  const svc = await t.api('POST', '/api/service', { name: 'Kiran', phone: '9800000010', consent: true, regNo: 'UP32KR1234', workshopId: ws.id, date, time: '10:00', serviceType: 'periodic' });
  assert.equal(svc.status, 201);
  // logged-in form post: name/phone prefilled, lead linked to account
  const lead = await t.api('POST', '/api/leads', { consent: true, message: 'hello' }, { cookie: c });
  assert.equal(lead.status, 201);
  assert.equal(t.db.q.get('SELECT customer_id, phone, name FROM leads WHERE id = ?', lead.json.lead.id).phone, '9800000010');
  assert.ok(t.db.q.get('SELECT customer_id c FROM leads WHERE id = ?', lead.json.lead.id).c);
  const bk = (await t.api('GET', '/api/customer/bookings', undefined, { cookie: c })).json;
  assert.ok(bk.some(b => b.id === svc.json.booking.id && b.type === 'service' && b.can_change === true));
  assert.ok((await t.api('GET', '/api/customer/enquiries', undefined, { cookie: c })).json.length >= 1);
  // cancel (> 2h away)
  assert.equal((await t.api('PATCH', `/api/customer/bookings/${svc.json.booking.id}`, { status: 'cancelled' }, { cookie: c })).json.status, 'cancelled');
  assert.equal((await t.api('PATCH', `/api/customer/bookings/${svc.json.booking.id}`, { status: 'cancelled' }, { cookie: c })).status, 422);
  // reschedule another
  const s2 = (await t.api('POST', '/api/service', { name: 'Kiran', phone: '9800000010', consent: true, regNo: 'UP32KR1234', workshopId: ws.id, date, time: '11:00', serviceType: 'repair' })).json.booking;
  const rs = await t.api('PATCH', `/api/customer/bookings/${s2.id}`, { date: futureDate(11), time: '14:00' }, { cookie: c });
  assert.equal(rs.status, 200); assert.equal(rs.json.time, '14:00');
  // someone else's booking is invisible / untouchable
  const other = await t.customer('9800000012');
  assert.equal((await t.api('PATCH', `/api/customer/bookings/${s2.id}`, { status: 'cancelled' }, { cookie: other })).status, 404);
  assert.ok(!(await t.api('GET', '/api/customer/bookings', undefined, { cookie: other })).json.some(b => b.id === s2.id));
});

test('cannot cancel within 2 hours of the slot', async () => {
  const c = await t.customer('9800000013');
  const ist = new Date(Date.now() + 5.5 * 3600e3 + 3600e3).toISOString();
  const info = t.db.q.run(`INSERT INTO bookings(type,name,phone,workshop_id,date,time,service_type,status,created_at,updated_at) VALUES ('service','Soon','9800000013',1,?,?,'periodic','booked',?,?)`, ist.slice(0, 10), ist.slice(11, 16), ist, ist);
  const id = Number(info.lastInsertRowid);
  const r = await t.api('PATCH', `/api/customer/bookings/${id}`, { status: 'cancelled' }, { cookie: c });
  assert.equal(r.status, 422); assert.match(r.json.error, /2 hours/);
  assert.equal((await t.api('POST', `/api/customer/bookings/${id}/cancel`, {}, { cookie: c })).status, 422);
});

test('vehicles CRUD is private to the owner; saved cars; service history', async () => {
  const a = await t.customer('9800000020'), b = await t.customer('9800000021');
  assert.equal((await t.api('POST', '/api/customer/vehicles', { reg_no: 'bad' }, { cookie: a })).status, 422);
  const v = (await t.api('POST', '/api/customer/vehicles', { reg_no: 'UP32 AB 9999', model: 'Model C', year: 2020, km: 40000, last_service: '2026-01-10' }, { cookie: a })).json;
  assert.equal(v.reg_no, 'UP32AB9999');
  assert.equal((await t.api('POST', '/api/customer/vehicles', { reg_no: 'UP32AB9999' }, { cookie: a })).status, 409);
  assert.equal((await t.api('GET', '/api/customer/vehicles', undefined, { cookie: b })).json.length, 0);
  assert.equal((await t.api('PUT', `/api/customer/vehicles/${v.id}`, { km: 1 }, { cookie: b })).status, 404);
  assert.equal((await t.api('DELETE', `/api/customer/vehicles/${v.id}`, undefined, { cookie: b })).status, 404);
  assert.equal((await t.api('PUT', `/api/customer/vehicles/${v.id}`, { km: 45000 }, { cookie: a })).json.km, 45000);
  assert.equal((await t.api('DELETE', `/api/customer/vehicles/${v.id}`, undefined, { cookie: a })).status, 200);
  // saved
  assert.equal((await t.api('POST', '/api/customer/saved', { kind: 'used', ref: 'UC-1182' }, { cookie: a })).status, 201);
  assert.equal((await t.api('POST', '/api/customer/saved', { kind: 'new', ref: 'model-s' }, { cookie: a })).status, 201);
  assert.equal((await t.api('POST', '/api/customer/saved', { kind: 'new', ref: 'nope' }, { cookie: a })).status, 404);
  const saved = (await t.api('GET', '/api/customer/saved', undefined, { cookie: a })).json;
  assert.equal(saved.length, 2);
  const used = saved.find(s => s.kind === 'used');
  assert.match(used.item.reg_masked, /UP32 •• ••/);
  assert.ok(!JSON.stringify(saved).includes('UP32KL7834'));
  assert.equal((await t.api('DELETE', '/api/customer/saved', { kind: 'used', ref: 'UC-1182' }, { cookie: a })).json.removed, 1);
  assert.equal((await t.api('GET', '/api/customer/saved', undefined, { cookie: b })).json.length, 0);
  // seeded demo customer
  const d = await t.customer('9876500001');
  assert.equal((await t.api('GET', '/api/customer/vehicles', undefined, { cookie: d })).json.length, 1);
  assert.equal((await t.api('GET', '/api/customer/service-history', undefined, { cookie: d })).json.length, 2);
  assert.equal((await t.api('GET', '/api/customer/saved', undefined, { cookie: d })).json.length, 2);
});

test('DPDP: export, withdraw consent sets opt-out, deletion is queued and admin completion anonymises', async () => {
  const phone = '9800000030';
  const c = await t.customer(phone);
  const lead = (await t.api('POST', '/api/leads', { name: 'Delete Me', phone, consent: true, message: 'secret message' })).json.lead;
  const ex = await t.api('GET', '/api/customer/export', undefined, { cookie: c });
  assert.equal(ex.status, 200);
  assert.ok(ex.json.customer.phone === phone && ex.json.enquiries.length >= 1 && ex.json.consents.length >= 1);
  assert.ok(!/password|id_hash/.test(ex.text));
  assert.equal((await t.api('POST', '/api/customer/data-request', { type: 'bogus' }, { cookie: c })).status, 422);
  const w = await t.api('POST', '/api/customer/data-request', { type: 'withdraw_consent' }, { cookie: c });
  assert.equal(w.json.status, 'completed');
  assert.equal(t.db.q.get('SELECT opted_out o FROM leads WHERE id = ?', lead.id).o, 1);
  assert.ok(t.db.q.get('SELECT 1 x FROM optouts WHERE phone = ?', phone));
  const del = await t.api('POST', '/api/customer/data-request', { type: 'delete' }, { cookie: c });
  assert.equal(del.status, 201); assert.equal(del.json.status, 'pending');
  assert.equal((await t.api('POST', '/api/customer/data-request', { type: 'delete' }, { cookie: c })).status, 409);
  const admin = await t.login('admin@companya.in', 'Admin@123');
  const queue = (await t.api('GET', '/api/admin/data-requests', undefined, { cookie: admin })).json;
  assert.ok(queue.some(r => r.id === del.json.id && r.status === 'pending'));
  assert.equal((await t.api('PATCH', `/api/admin/data-requests/${del.json.id}`, { status: 'completed' }, { cookie: await t.login('priya@companya.in', 'Sales@123') })).status, 403);
  assert.equal((await t.api('PATCH', `/api/admin/data-requests/${del.json.id}`, { status: 'completed' }, { cookie: admin })).status, 200);
  const l = t.db.q.get('SELECT name, phone, message FROM leads WHERE id = ?', lead.id);
  assert.equal(l.name, 'Deleted customer'); assert.equal(l.message, null); assert.notEqual(l.phone, phone);
  assert.equal(t.db.q.get('SELECT COUNT(*) c FROM customers WHERE phone = ?', phone).c, 0);
  assert.equal((await t.api('GET', '/api/customer/me', undefined, { cookie: c })).status, 401);
  const audit = (await t.api('GET', '/api/admin/audit?limit=200', undefined, { cookie: admin })).json;
  assert.ok(audit.some(a => a.action === 'data_request' && /delete/.test(JSON.stringify(a.detail))));
  assert.ok(audit.some(a => a.action === 'data_request_completed'));
});
