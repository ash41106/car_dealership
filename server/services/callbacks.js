'use strict';
/** Service call-back queue with a 15-minute SLA. */
const { q, tx } = require('../lib/db');
const { httpError, normPhone, clean, nowIso, toInt, truthy } = require('../lib/util');
const { can } = require('../lib/perms');
const leads = require('./leads');

const CB_SLA_MS = 15 * 60 * 1000;
const CB_STATUS = ['new', 'contacted', 'scheduled', 'closed'];

function cbSla(c) {
  const due = Date.parse(c.due_at);
  const responded = !!c.first_response_at;
  return { due_at: c.due_at, responded, breached: responded ? Date.parse(c.first_response_at) > due : Date.now() > due, remaining_sec: responded ? null : Math.round((due - Date.now()) / 1000) };
}
function shape(c) { return { ...c, sla: cbSla(c) }; }

function pickAdvisor(workshopId) {
  const rows = q.all(`SELECT u.id, u.name, u.workshop_id, (SELECT COUNT(*) FROM service_callbacks c WHERE c.assigned_to = u.id AND c.status != 'closed') AS open_n
    FROM users u WHERE u.active = 1 AND u.role IN ('service_advisor','workshop_manager')`);
  const mine = workshopId ? rows.filter(r => r.workshop_id === workshopId) : [];
  const pool = mine.length ? mine : rows;
  return pool.sort((a, b) => a.open_n - b.open_n || a.id - b.id)[0] || null;
}

function createCallback(d, opts = {}) {
  const errors = {};
  const name = clean(d.name, 80);
  if (name.length < 2) errors.name = 'Name must be 2-80 characters';
  const phone = normPhone(d.phone);
  if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number';
  if (!truthy(d.consent)) errors.consent = 'Consent is required to call you back';
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);
  const wid = toInt(d.workshopId, 0) || null;
  if (wid && !q.get('SELECT 1 x FROM workshops WHERE id = ? AND active = 1', wid)) throw httpError(422, 'Unknown workshop', { workshopId: 'Unknown workshop' });
  const lang = d.lang === 'hi' ? 'hi' : 'en';
  return tx(() => {
    const adv = pickAdvisor(wid);
    const now = nowIso();
    const r = q.run(`INSERT INTO service_callbacks(customer_id,name,phone,reason,preferred_time,workshop_id,status,assigned_to,created_at,due_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      opts.customerId || null, name, phone, clean(d.reason, 300) || null, clean(d.preferred_time, 60) || null, wid || (adv ? adv.workshop_id : null), 'new', adv ? adv.id : null, now,
      new Date(Date.parse(now) + CB_SLA_MS).toISOString(), now);
    leads.recordConsent(phone, null, lang, opts.ip, 'service_callback');
    const id = Number(r.lastInsertRowid);
    return { callback: { id, status: 'new', due_at: new Date(Date.parse(now) + CB_SLA_MS).toISOString() }, assignee: adv ? { name: adv.name } : null };
  });
}

function scope(user) {
  if (can(user, 'booking.read.all')) return { sql: '1=1', p: [] };
  return { sql: '(c.workshop_id = ? OR c.assigned_to = ?)', p: [user.workshop_id || 0, user.id] };
}

function list(user, f = {}) {
  const sc = scope(user);
  const where = [sc.sql], p = [...sc.p];
  if (f.status && CB_STATUS.includes(f.status)) { where.push('c.status = ?'); p.push(f.status); }
  if (f.breached && truthy(f.breached)) { where.push('((c.first_response_at IS NOT NULL AND c.first_response_at > c.due_at) OR (c.first_response_at IS NULL AND c.due_at < ?))'); p.push(nowIso()); }
  return q.all(`SELECT c.*, u.name AS assignee_name, w.name_en AS workshop_name FROM service_callbacks c LEFT JOIN users u ON u.id = c.assigned_to
    LEFT JOIN workshops w ON w.id = c.workshop_id WHERE ${where.join(' AND ')} ORDER BY CASE WHEN c.status='new' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 300`, ...p).map(shape);
}

function update(user, id, body) {
  const sc = scope(user);
  const c = q.get(`SELECT c.* FROM service_callbacks c WHERE c.id = ? AND ${sc.sql}`, toInt(id), ...sc.p);
  if (!c) {
    if (q.get('SELECT 1 x FROM service_callbacks WHERE id = ?', toInt(id))) throw httpError(403, 'Not permitted for this call-back');
    throw httpError(404, 'Call-back not found');
  }
  const sets = [], p = [];
  if (body.status !== undefined) {
    if (!CB_STATUS.includes(body.status)) throw httpError(422, 'Invalid status', { status: 'Allowed: ' + CB_STATUS.join(', ') });
    sets.push('status = ?'); p.push(body.status);
    if (c.status === 'new' && body.status !== 'new' && !c.first_response_at) { sets.push('first_response_at = ?'); p.push(nowIso()); }
  }
  if (body.assigned_to !== undefined) {
    const t = q.get("SELECT id, workshop_id FROM users WHERE id = ? AND active = 1 AND role IN ('service_advisor','workshop_manager')", toInt(body.assigned_to));
    if (!t) throw httpError(422, 'Choose an active service advisor', { assigned_to: 'Invalid user' });
    if (scope(user).sql !== '1=1' && t.workshop_id !== user.workshop_id) throw httpError(403, 'You can assign only within your own workshop');
    sets.push('assigned_to = ?'); p.push(t.id);
  }
  if (body.notes !== undefined) { sets.push('notes = ?'); p.push(clean(body.notes, 1000)); }
  if (sets.length) q.run(`UPDATE service_callbacks SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...p, nowIso(), c.id);
  return shape(q.get('SELECT * FROM service_callbacks WHERE id = ?', c.id));
}

module.exports = { createCallback, list, update, cbSla, CB_STATUS };
