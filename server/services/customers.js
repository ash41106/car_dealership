'use strict';
/** Customer accounts (buyers & owners): phone-OTP login (no passwords), self-service data, DPDP rights. */
const crypto = require('node:crypto');
const { q, tx } = require('../lib/db');
const { httpError, normPhone, validEmail, clean, nowIso, toInt, toNum, normReg, validReg, maskReg, sha, truthy } = require('../lib/util');
const auth = require('../lib/auth');
const { rateLimit } = require('../lib/router');
const messaging = require('./messaging');
const leads = require('./leads');
const sales = require('./sales');
const used = require('./used');
const admin = require('./admin');

const OTP_TTL_MS = 5 * 60 * 1000, MAX_ATTEMPTS = 5, FIXED_OTP = '123456';
/** Mock OTP mode (dev_otp + fixed 123456) can never be active in production. */
const mockMode = () => (process.env.NODE_ENV === 'production' ? false : process.env.OTP_MODE ? process.env.OTP_MODE === 'mock' : true);
const otpHash = (phone, otp) => auth.hmac(`otp:${phone}:${otp}`);

async function requestOtp({ phone, lang }, ip) {
  const p = normPhone(phone);
  if (!p) throw httpError(422, 'Enter a valid 10-digit Indian mobile number', { phone: 'Invalid phone' });
  const ready = messaging.otpDeliverable();
  if (!ready.ok) { console.error('[otp] cannot send OTP:', ready.reason); throw httpError(503, 'OTP login is temporarily unavailable. Please call the dealership.'); }
  const limit = parseInt(process.env.OTP_RATE_LIMIT || '3', 10);
  if (!rateLimit('otp|' + p, limit, 10 * 60000) || !rateLimit('otpip|' + ip, limit * 7, 10 * 60000)) throw httpError(429, 'Too many OTP requests. Please wait a few minutes.');
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  tx(() => {
    q.run('UPDATE customer_otps SET used = 1 WHERE phone = ? AND used = 0', p);
    q.run('INSERT INTO customer_otps(phone,otp_hash,expires_at,created_at) VALUES (?,?,?,?)', p, otpHash(p, otp), new Date(Date.now() + OTP_TTL_MS).toISOString(), nowIso());
  });
  const sent = messaging.sendTemplate({ phone: p, template: 'otp', lang: lang === 'hi' ? 'hi' : 'en', vars: { otp }, channel: 'sms', transactional: true });
  const result = sent.promise ? await sent.promise : sent;
  if (result.status === 'failed') {
    q.run('UPDATE customer_otps SET used = 1 WHERE phone = ? AND used = 0', p);
    console.error('[otp] gateway failed:', result.error);
    throw httpError(502, 'We could not send the OTP right now. Please try again in a minute.');
  }
  const out = { ok: true, expires_in: OTP_TTL_MS / 1000 };
  if (mockMode()) { out.dev_otp = otp; out.dev_note = `OTP_MODE=mock: ${FIXED_OTP} also works for any number`; }
  return out;
}

function verifyOtp({ phone, otp, name }, ctx) {
  const p = normPhone(phone);
  if (!p) throw httpError(422, 'Enter a valid 10-digit Indian mobile number', { phone: 'Invalid phone' });
  if (!rateLimit('otpv|' + p, 15, 10 * 60000)) throw httpError(429, 'Too many attempts. Please wait a few minutes.');
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) throw httpError(422, 'Enter the 6-digit OTP', { otp: 'Invalid OTP' });
  const row = q.get('SELECT * FROM customer_otps WHERE phone = ? AND used = 0 ORDER BY id DESC LIMIT 1', p);
  if (mockMode() && code === FIXED_OTP) { if (row) q.run('UPDATE customer_otps SET used = 1 WHERE id = ?', row.id); }
  else {
    if (!row) throw httpError(400, 'Request a new OTP first');
    if (Date.parse(row.expires_at) < Date.now()) { q.run('UPDATE customer_otps SET used = 1 WHERE id = ?', row.id); throw httpError(400, 'OTP expired. Request a new one.'); }
    if (row.attempts >= MAX_ATTEMPTS) throw httpError(429, 'Too many wrong attempts. Request a new OTP.');
    q.run('UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?', row.id);
    const a = Buffer.from(otpHash(p, code)), b = Buffer.from(row.otp_hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError(401, 'Incorrect OTP');
    q.run('UPDATE customer_otps SET used = 1 WHERE id = ?', row.id);
  }
  let c = q.get('SELECT * FROM customers WHERE phone = ?', p);
  const nm = clean(name, 80);
  if (!c) {
    const r = q.run('INSERT INTO customers(phone,name,lang,created_at,last_login_at) VALUES (?,?,?,?,?)', p, nm.length >= 2 ? nm : null, ctx.lang || 'en', nowIso(), nowIso());
    c = q.get('SELECT * FROM customers WHERE id = ?', Number(r.lastInsertRowid));
  } else {
    q.run('UPDATE customers SET last_login_at = ?, name = COALESCE(name, ?) WHERE id = ?', nowIso(), nm.length >= 2 ? nm : null, c.id);
    c = q.get('SELECT * FROM customers WHERE id = ?', c.id);
  }
  const token = auth.createSession('customer', c.id, 'customer', ctx);
  return { token, customer: me(c) };
}
const me = c => ({ id: c.id, phone: c.phone, name: c.name, email: c.email, lang: c.lang });

function updateMe(cust, body) {
  const sets = [], p = [], errors = {};
  if (body.name !== undefined) { const n = clean(body.name, 80); if (n.length < 2) errors.name = 'Name must be 2-80 characters'; else { sets.push('name = ?'); p.push(n); } }
  if (body.email !== undefined) { if (body.email && !validEmail(String(body.email))) errors.email = 'Invalid email'; else { sets.push('email = ?'); p.push(body.email ? clean(body.email, 120) : null); } }
  if (body.lang !== undefined) { if (!['en', 'hi'].includes(body.lang)) errors.lang = 'Must be en or hi'; else { sets.push('lang = ?'); p.push(body.lang); } }
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);
  if (sets.length) q.run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, ...p, cust.id);
  return me(q.get('SELECT * FROM customers WHERE id = ?', cust.id));
}

// ------------------------------------------------------------ bookings
const slotMs = b => Date.parse(`${b.date}T${b.time}:00+05:30`);
const canChange = b => ['booked', 'confirmed'].includes(b.status) && slotMs(b) - Date.now() >= 2 * 3600 * 1000;

function bookings(cust) {
  return q.all(`SELECT b.*, s.name_en AS showroom_name, w.name_en AS workshop_name, m.name AS model FROM bookings b LEFT JOIN showrooms s ON s.id = b.showroom_id
    LEFT JOIN workshops w ON w.id = b.workshop_id LEFT JOIN models m ON m.id = b.model_id WHERE b.phone = ? OR b.customer_id = ? ORDER BY b.date DESC, b.time DESC`, cust.phone, cust.id)
    .map(b => ({ id: b.id, ref: (b.type === 'service' ? 'SV-' : 'TD-') + String(b.id).padStart(5, '0'), type: b.type, date: b.date, time: b.time, status: b.status, service_type: b.service_type,
      place: b.showroom_name || b.workshop_name, model: b.model || b.model_name, reg_no: b.reg_no, notes: b.notes, can_change: canChange(b),
      job_card: b.type === 'service' ? { checked_in_at: b.checked_in_at, in_progress_at: b.in_progress_at, ready_at: b.ready_at, delivered_at: b.delivered_at } : undefined }));
}

function ownBooking(cust, id) {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND (phone = ? OR customer_id = ?)', toInt(id), cust.phone, cust.id);
  if (!b) throw httpError(404, 'Booking not found');
  return b;
}
function cancelBooking(cust, id) {
  const b = ownBooking(cust, id);
  if (!['booked', 'confirmed'].includes(b.status)) throw httpError(422, `A ${b.status} booking cannot be cancelled`);
  if (!canChange(b)) throw httpError(422, 'Bookings cannot be changed within 2 hours of the slot. Please call the dealership.');
  q.run("UPDATE bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), b.id);
  return { id: b.id, status: 'cancelled' };
}
function rescheduleBooking(cust, id, { date, time }) {
  const b = ownBooking(cust, id);
  if (!canChange(b)) throw httpError(422, 'Bookings cannot be changed within 2 hours of the slot, or after completion.');
  sales.checkDate(date);
  const key = b.type === 'service' ? 'svc_slots' : 'td_slots';
  if (!sales.slotTimes(key, key === 'svc_slots' ? '09:00,10:00,11:00,12:00,14:00,15:00,16:00' : '10:00,11:00,12:00,14:00,15:00,16:00,17:00').includes(time)) throw httpError(422, 'Not a valid slot time', { time: 'Invalid slot' });
  if (sales.slotInPast(date, time) || slotMs({ date, time }) - Date.now() < 2 * 3600 * 1000) throw httpError(422, 'Choose a slot at least 2 hours from now', { time: 'Too soon' });
  try {
    tx(() => {
      if (b.type === 'service') {
        const w = q.get('SELECT bays FROM workshops WHERE id = ?', b.workshop_id);
        const n = q.get("SELECT COUNT(*) c FROM bookings WHERE type='service' AND workshop_id = ? AND date = ? AND time = ? AND status NOT IN ('cancelled','no_show') AND id != ?", b.workshop_id, date, time, b.id).c;
        if (n >= w.bays) throw httpError(409, 'All service bays are booked for this slot.');
        q.run('UPDATE bookings SET date = ?, time = ?, updated_at = ? WHERE id = ?', date, time, nowIso(), b.id);
      } else {
        const cars = q.all('SELECT id FROM demo_cars WHERE showroom_id = ? AND model_id = ? AND active = 1 ORDER BY id', b.showroom_id, b.model_id);
        const car = cars.find(c => !q.get("SELECT 1 x FROM bookings WHERE demo_car_id = ? AND date = ? AND time = ? AND type='test_drive' AND status NOT IN ('cancelled','no_show') AND id != ?", c.id, date, time, b.id));
        if (!car) throw httpError(409, 'This slot is no longer available.');
        q.run('UPDATE bookings SET date = ?, time = ?, demo_car_id = ?, updated_at = ? WHERE id = ?', date, time, car.id, nowIso(), b.id);
      }
    });
  } catch (e) { if (/UNIQUE/i.test(String(e.message))) throw httpError(409, 'This slot is no longer available.'); throw e; }
  return { id: b.id, date, time, status: b.status };
}

function enquiries(cust) {
  return q.all(`SELECT l.id, l.type, l.status, l.message, l.created_at, m.name AS model, u.name AS assignee_name, u.phone AS assignee_phone FROM leads l
    LEFT JOIN models m ON m.id = l.model_id LEFT JOIN users u ON u.id = l.assigned_to WHERE l.phone = ? OR l.customer_id = ? ORDER BY l.created_at DESC`, cust.phone, cust.id);
}
function serviceHistory(cust) {
  return q.all(`SELECT b.id, b.date, b.time, b.service_type, b.status, b.reg_no, b.model_name, b.delivered_at, w.name_en AS workshop FROM bookings b LEFT JOIN workshops w ON w.id = b.workshop_id
    WHERE b.type = 'service' AND b.status IN ('delivered','completed') AND (b.phone = ? OR b.customer_id = ?) ORDER BY b.date DESC`, cust.phone, cust.id);
}

// ------------------------------------------------------------ vehicles
function vehicleInput(body, partial) {
  const errors = {}, o = {};
  if (!partial || body.reg_no !== undefined) { if (!validReg(body.reg_no)) errors.reg_no = 'Enter a valid registration number, e.g. UP32AB1234'; else o.reg_no = normReg(body.reg_no); }
  if (body.model !== undefined) o.model = clean(body.model, 60) || null;
  if (body.year !== undefined && body.year !== '') { const y = toInt(body.year, 0); if (y < 1990 || y > new Date().getFullYear() + 1) errors.year = 'Invalid year'; else o.year = y; }
  if (body.km !== undefined && body.km !== '') { const k = toNum(body.km); if (k === null || k < 0 || k > 2000000) errors.km = 'Invalid km'; else o.km = Math.round(k); }
  if (body.last_service !== undefined && body.last_service !== '') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.last_service))) errors.last_service = 'Use YYYY-MM-DD'; else o.last_service = body.last_service; }
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);
  return o;
}
const listVehicles = cust => q.all('SELECT id, reg_no, model, year, km, last_service FROM customer_vehicles WHERE customer_id = ? ORDER BY id', cust.id);
function addVehicle(cust, body) {
  const o = vehicleInput(body, false);
  try {
    const r = q.run('INSERT INTO customer_vehicles(customer_id,reg_no,model,year,km,last_service,created_at) VALUES (?,?,?,?,?,?,?)', cust.id, o.reg_no, o.model || null, o.year || null, o.km ?? null, o.last_service || null, nowIso());
    return q.get('SELECT id, reg_no, model, year, km, last_service FROM customer_vehicles WHERE id = ?', Number(r.lastInsertRowid));
  } catch (e) { if (/UNIQUE/i.test(String(e.message))) throw httpError(409, 'This vehicle is already in your garage'); throw e; }
}
function updateVehicle(cust, id, body) {
  const v = q.get('SELECT * FROM customer_vehicles WHERE id = ? AND customer_id = ?', toInt(id), cust.id);
  if (!v) throw httpError(404, 'Vehicle not found');
  const o = vehicleInput(body, true);
  const cols = Object.keys(o);
  if (cols.length) { try { q.run(`UPDATE customer_vehicles SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...cols.map(c => o[c]), v.id); } catch (e) { if (/UNIQUE/i.test(String(e.message))) throw httpError(409, 'This vehicle is already in your garage'); throw e; } }
  return q.get('SELECT id, reg_no, model, year, km, last_service FROM customer_vehicles WHERE id = ?', v.id);
}
function deleteVehicle(cust, id) {
  const r = q.run('DELETE FROM customer_vehicles WHERE id = ? AND customer_id = ?', toInt(id), cust.id);
  if (!Number(r.changes)) throw httpError(404, 'Vehicle not found');
  return { deleted: true };
}

// ------------------------------------------------------------ saved cars
function listSaved(cust) {
  return q.all('SELECT * FROM saved_cars WHERE customer_id = ? ORDER BY id DESC', cust.id).map(s => {
    if (s.kind === 'used') { const u = used.getUsed(s.ref); return { kind: 'used', ref: s.ref, saved_at: s.created_at, item: u && { stock_id: u.stock_id, slug: u.slug, title: u.title, price: u.price, status: u.status, photo: u.photos[0] || null, reg_masked: u.reg_masked } }; }
    const m = q.get('SELECT slug, name, hero_image, (SELECT MIN(ex_showroom) FROM variants WHERE model_id = models.id AND active = 1) AS from_price FROM models WHERE slug = ?', s.ref);
    return { kind: 'new', ref: s.ref, saved_at: s.created_at, item: m || null };
  });
}
function saveCar(cust, { kind, ref }) {
  if (!['new', 'used'].includes(kind)) throw httpError(422, "kind must be 'new' or 'used'", { kind: 'Invalid' });
  let r = clean(ref, 100).toLowerCase();
  if (kind === 'used') { const u = used.getUsed(r); if (!u) throw httpError(404, 'Car not found'); r = u.slug; }
  else if (!q.get('SELECT 1 x FROM models WHERE slug = ? AND active = 1', r)) throw httpError(404, 'Model not found');
  q.run('INSERT OR IGNORE INTO saved_cars(customer_id,kind,ref,created_at) VALUES (?,?,?,?)', cust.id, kind, r, nowIso());
  return { kind, ref: r, saved: true };
}
function unsaveCar(cust, { kind, ref }) {
  let r = clean(ref, 100).toLowerCase();
  if (kind === 'used') { const u = used.getUsed(r); if (u) r = u.slug; }
  const x = q.run('DELETE FROM saved_cars WHERE customer_id = ? AND kind = ? AND ref = ?', cust.id, String(kind), r);
  return { removed: Number(x.changes) };
}

// ------------------------------------------------------------ DPDP rights
function exportData(cust) {
  const c = q.get('SELECT id, phone, name, email, lang, created_at, last_login_at FROM customers WHERE id = ?', cust.id);
  return {
    exported_at: nowIso(), customer: c, vehicles: listVehicles(cust), saved_cars: listSaved(cust), bookings: bookings(cust), enquiries: enquiries(cust),
    consents: q.all('SELECT purpose, text, lang, created_at FROM consents WHERE phone = ? ORDER BY id', cust.phone),
    messages: q.all('SELECT channel, template, body, status, created_at FROM messages WHERE phone = ? ORDER BY id', cust.phone),
    data_requests: q.all('SELECT id, type, status, created_at, handled_at FROM data_requests WHERE customer_id = ? ORDER BY id', cust.id),
  };
}
function dataRequest(cust, { type }) {
  if (!['export', 'delete', 'withdraw_consent'].includes(type)) throw httpError(422, 'type must be export, delete or withdraw_consent', { type: 'Invalid' });
  const who = { id: null, email: 'customer:' + cust.phone.slice(0, 2) + '******' + cust.phone.slice(-2) };
  return tx(() => {
    let status = 'pending', extra = {};
    if (type === 'export') { status = 'completed'; extra = { download: '/api/customer/export' }; }
    if (type === 'withdraw_consent') {
      extra = leads.optOut({ phone: cust.phone });
      leads.recordConsent(cust.phone, null, cust.lang, null, 'withdrawn', 'Consent withdrawn by the customer via account settings');
      status = 'completed';
    }
    if (type === 'delete' && q.get("SELECT 1 x FROM data_requests WHERE customer_id = ? AND type = 'delete' AND status = 'pending'", cust.id)) throw httpError(409, 'A deletion request is already pending');
    const r = q.run('INSERT INTO data_requests(customer_id,phone,type,status,created_at,handled_at) VALUES (?,?,?,?,?,?)', cust.id, cust.phone, type, status, nowIso(), status === 'completed' ? nowIso() : null);
    admin.audit(who, 'data_request', 'customers', cust.id, { type, status });
    return { id: Number(r.lastInsertRowid), type, status, ...extra };
  });
}

/** Link a freshly created booking/lead to the logged-in customer. */
function link(cust, table, id) { if (cust && id) q.run(`UPDATE ${table} SET customer_id = ? WHERE id = ?`, cust.id, id); }

function listDataRequests() {
  return q.all('SELECT d.*, c.name FROM data_requests d LEFT JOIN customers c ON c.id = d.customer_id ORDER BY d.id DESC LIMIT 200');
}
/** Admin completes/rejects a request. Completing a deletion anonymises the customer's personal data. */
function resolveDataRequest(user, id, { status }) {
  const d = q.get('SELECT * FROM data_requests WHERE id = ?', toInt(id));
  if (!d) throw httpError(404, 'Request not found');
  if (!['completed', 'rejected'].includes(status)) throw httpError(422, 'status must be completed or rejected', { status: 'Invalid' });
  if (d.status !== 'pending') throw httpError(409, 'Request already handled');
  tx(() => {
    if (status === 'completed' && d.type === 'delete') {
      const tag = 'deleted-' + sha(d.phone).slice(0, 10);
      q.run("UPDATE leads SET name = 'Deleted customer', phone = ?, email = NULL, message = NULL, trade_in = NULL, notes = NULL, customer_id = NULL WHERE phone = ? OR customer_id = ?", tag, d.phone, d.customer_id);
      q.run("UPDATE bookings SET name = 'Deleted customer', phone = ?, email = NULL, notes = NULL, reg_no = NULL, customer_id = NULL WHERE phone = ? OR customer_id = ?", tag, d.phone, d.customer_id);
      q.run("UPDATE service_callbacks SET name = 'Deleted customer', phone = ?, reason = NULL, customer_id = NULL WHERE phone = ?", tag, d.phone);
      q.run("UPDATE messages SET phone = ?, body = '[deleted]' WHERE phone = ?", tag, d.phone);
      q.run('UPDATE consents SET phone = ? WHERE phone = ?', tag, d.phone);
      q.run('DELETE FROM customer_otps WHERE phone = ?', d.phone);
      if (d.customer_id) { auth.revokeCustomerSessions(d.customer_id); q.run('DELETE FROM customers WHERE id = ?', d.customer_id); }
    }
    q.run('UPDATE data_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?', status, user.id, nowIso(), d.id);
    admin.audit(user, 'data_request_' + status, 'data_requests', d.id, { type: d.type });
  });
  return q.get('SELECT * FROM data_requests WHERE id = ?', d.id);
}

module.exports = { requestOtp, verifyOtp, me, updateMe, bookings, cancelBooking, rescheduleBooking, enquiries, serviceHistory, listVehicles, addVehicle, updateVehicle, deleteVehicle,
  listSaved, saveCar, unsaveCar, exportData, dataRequest, link, listDataRequests, resolveDataRequest, mockMode, canChange };
