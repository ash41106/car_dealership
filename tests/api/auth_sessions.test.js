'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start } = require('./_helper');
let t;
before(async () => { t = await start(); });
after(() => t.close());
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const token = cookie => cookie.split('=')[1];

test('session cookie is opaque; only its hash is stored; /api/me returns role, permissions and scope', async () => {
  const c = await t.login('manager.gomti@companya.in', 'Manager@123');
  assert.match(token(c), /^[A-Za-z0-9_-]{40,}$/);
  assert.throws(() => JSON.parse(Buffer.from(token(c).split('.')[0], 'base64url').toString()));
  const row = t.db.q.get('SELECT * FROM sessions WHERE id_hash = ?', sha(token(c)));
  assert.equal(row.kind, 'staff'); assert.equal(row.role, 'showroom_manager'); assert.ok(row.ip);
  assert.equal(t.db.q.get('SELECT COUNT(*) c FROM sessions WHERE id_hash = ?', token(c)).c, 0);
  const me = (await t.api('GET', '/api/me', undefined, { cookie: c })).json;
  assert.equal(me.role, 'showroom_manager');
  assert.ok(me.permissions.includes('lead.read.showroom') && !me.permissions.includes('lead.read.all'));
  assert.ok(me.scope.showroom_id > 0 && me.scope.workshop_id === null);
});

test('logout and revoke-all invalidate server-side sessions', async () => {
  const a = await t.login('neha@companya.in', 'Sales@123'), b = await t.login('neha@companya.in', 'Sales@123');
  assert.equal((await t.api('POST', '/api/auth/logout', {}, { cookie: a })).status, 200);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: a })).status, 401);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: b })).status, 200);
  const c = await t.login('neha@companya.in', 'Sales@123');
  assert.equal((await t.api('POST', '/api/auth/revoke-all', {}, { cookie: c })).status, 200);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: b })).status, 401);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: c })).status, 401);
});

test('idle timeout: 30 min staff, 30 days customer', async () => {
  const c = await t.login('amit@companya.in', 'Sales@123');
  t.db.q.run('UPDATE sessions SET last_seen = ? WHERE id_hash = ?', new Date(Date.now() - 29 * 60000).toISOString(), sha(token(c)));
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: c })).status, 200);
  t.db.q.run('UPDATE sessions SET last_seen = ? WHERE id_hash = ?', new Date(Date.now() - 31 * 60000).toISOString(), sha(token(c)));
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: c })).status, 401);
  const cc = await t.customer('9800000011');
  t.db.q.run('UPDATE sessions SET last_seen = ? WHERE id_hash = ?', new Date(Date.now() - 29 * 86400000).toISOString(), sha(token(cc)));
  assert.equal((await t.api('GET', '/api/customer/me', undefined, { cookie: cc })).status, 200);
  t.db.q.run('UPDATE sessions SET last_seen = ? WHERE id_hash = ?', new Date(Date.now() - 31 * 86400000).toISOString(), sha(token(cc)));
  assert.equal((await t.api('GET', '/api/customer/me', undefined, { cookie: cc })).status, 401);
});

test('change-password: policy, wrong current, invalidates other sessions, new password works', async () => {
  const admin = await t.login('admin@companya.in', 'Admin@123');
  const u = (await t.api('POST', '/api/admin/users', { name: 'Pw Tester', email: 'pw@companya.in', role: 'consultant', password: 'Initial#Pass1', showroom_id: 1 }, { cookie: admin })).json;
  assert.ok(u.id);
  const a = await t.login('pw@companya.in', 'Initial#Pass1'), b = await t.login('pw@companya.in', 'Initial#Pass1');
  assert.equal((await t.api('POST', '/api/auth/change-password', { current_password: 'Initial#Pass1', new_password: 'short1' }, { cookie: a })).status, 422);
  assert.equal((await t.api('POST', '/api/auth/change-password', { current_password: 'wrong', new_password: 'Brand#New#Pass9' }, { cookie: a })).status, 401);
  const ok = await t.api('POST', '/api/auth/change-password', { current_password: 'Initial#Pass1', new_password: 'Brand#New#Pass9' }, { cookie: a });
  assert.equal(ok.status, 200);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: b })).status, 401);
  const fresh = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: fresh })).status, 200);
  assert.equal((await t.api('POST', '/api/auth/login', { email: 'pw@companya.in', password: 'Initial#Pass1' })).status, 401);
  assert.equal((await t.api('POST', '/api/auth/login', { email: 'pw@companya.in', password: 'Brand#New#Pass9' })).status, 200);
  const h = t.db.q.get("SELECT password_hash h FROM users WHERE email = 'pw@companya.in'").h;
  assert.ok(h.startsWith('scrypt$') && !h.includes('Brand'));
});

test('admin reset-password gives one-time temp password and forces change; deactivate kills sessions', async () => {
  const admin = await t.login('admin@companya.in', 'Admin@123');
  const u = (await t.api('POST', '/api/admin/users', { name: 'Reset Me', email: 'reset@companya.in', role: 'service_advisor', password: 'Initial#Pass1', workshop_id: 1 }, { cookie: admin })).json;
  const old = await t.login('reset@companya.in', 'Initial#Pass1');
  const r = await t.api('POST', `/api/admin/users/${u.id}/reset-password`, {}, { cookie: admin });
  assert.equal(r.status, 200); assert.ok(r.json.temp_password.length >= 10);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: old })).status, 401);
  const c = await t.login('reset@companya.in', r.json.temp_password);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: c })).json.must_change_password, true);
  const blocked = await t.api('GET', '/api/staff/bookings', undefined, { cookie: c });
  assert.equal(blocked.status, 403); assert.equal(blocked.json.errors.code, 'password_change_required');
  assert.equal((await t.api('POST', '/api/auth/change-password', { current_password: r.json.temp_password, new_password: 'My#Own#Pass123' }, { cookie: c })).status, 200);
  const c2 = await t.login('reset@companya.in', 'My#Own#Pass123');
  assert.equal((await t.api('GET', '/api/staff/bookings', undefined, { cookie: c2 })).status, 200);
  // deactivate
  assert.equal((await t.api('PUT', `/api/admin/users/${u.id}`, { active: false }, { cookie: admin })).status, 200);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: c2 })).status, 401);
  assert.equal((await t.api('POST', '/api/auth/login', { email: 'reset@companya.in', password: 'My#Own#Pass123' })).status, 401);
  // non-admin cannot reset
  const priya = await t.login('priya@companya.in', 'Sales@123');
  assert.equal((await t.api('POST', `/api/admin/users/${u.id}/reset-password`, {}, { cookie: priya })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/users', { name: 'Weak', email: 'weak@companya.in', role: 'consultant', password: 'short' }, { cookie: admin })).status, 422);
});

test('logins and failed logins are audited; no password material in audit', async () => {
  await t.api('POST', '/api/auth/login', { email: 'priya@companya.in', password: 'nope-nope' });
  const admin = await t.login('admin@companya.in', 'Admin@123');
  const audit = (await t.api('GET', '/api/admin/audit?limit=300', undefined, { cookie: admin })).json;
  assert.ok(audit.some(a => a.action === 'login_failed' && a.user_email === 'priya@companya.in'));
  assert.ok(audit.some(a => a.action === 'login' && a.user_email === 'admin@companya.in'));
  assert.ok(audit.some(a => a.action === 'reset_password'));
  assert.ok(!/nope-nope|Admin@123|scrypt\$/.test(JSON.stringify(audit)));
});

test('N-01: AI summary without a model does not say "interested in not specified"', async () => {
  const ai = require('../../server/services/ai');
  const s = ai.summarizeLead({ name: 'Anil Kumar', status: 'new', message: 'please call me' });
  assert.ok(!/not specified\./.test(s.text) && !/interested in not/.test(s.text));
  assert.match(s.text, /model not specified yet/);
});
