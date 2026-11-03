'use strict';
/** Authentication: scrypt passwords, opaque server-side sessions (staff cookie `sid`, customer cookie `cs`), login throttling, permission guard. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { q, dataDir } = require('./db');
const { httpError, nowIso } = require('./util');
const perms = require('./perms');

const COOKIE = 'sid';
const CUSTOMER_COOKIE = 'cs';
const IDLE_MS = { staff: 30 * 60 * 1000, customer: 30 * 86400 * 1000 };
const ABS_MS = { staff: 12 * 3600 * 1000, customer: 90 * 86400 * 1000 };
const MIN_PASSWORD = 10;
let secret = null;

function getSecret() {
  if (secret) return secret;
  if (process.env.SESSION_SECRET) return (secret = process.env.SESSION_SECRET);
  const f = path.join(dataDir(), '.session_secret');
  try { secret = fs.readFileSync(f, 'utf8').trim(); } catch {}
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(f, secret, { mode: 0o600 });
  }
  return secret;
}
function hmac(s) { return crypto.createHmac('sha256', getSecret()).update(String(s)).digest('hex'); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const h = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64);
    const b = Buffer.from(hash, 'hex');
    return b.length === h.length && crypto.timingSafeEqual(h, b);
  } catch { return false; }
}
const DUMMY = hashPassword('dummy-password-for-timing');
function checkPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw httpError(422, `Password must be at least ${MIN_PASSWORD} characters`, { password: `Minimum ${MIN_PASSWORD} characters` });
  if (pw.length > 200) throw httpError(422, 'Password too long', { password: 'Too long' });
}
function tempPassword() { return crypto.randomBytes(9).toString('base64url') + 'a1'; }

// ------------------------------------------------------------------ sessions
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
/** Create a session; returns the opaque token to put in the cookie. Only its hash is stored. */
function createSession(kind, subjectId, role, ctx = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  q.run('INSERT INTO sessions(id_hash,kind,user_id,customer_id,role,created_at,last_seen,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?,?,?,?)',
    sha(token), kind, kind === 'staff' ? subjectId : null, kind === 'customer' ? subjectId : null, role, new Date(now).toISOString(), new Date(now).toISOString(),
    new Date(now + ABS_MS[kind]).toISOString(), ctx.ip || null, String((ctx.req && ctx.req.headers['user-agent']) || '').slice(0, 200));
  return token;
}
function lookupSession(kind, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const s = q.get('SELECT * FROM sessions WHERE id_hash = ? AND kind = ? AND revoked = 0', sha(token), kind);
  if (!s) return null;
  const now = Date.now();
  if (Date.parse(s.expires_at) < now || Date.parse(s.last_seen) + IDLE_MS[kind] < now) { q.run('UPDATE sessions SET revoked = 1 WHERE id_hash = ?', s.id_hash); return null; }
  if (now - Date.parse(s.last_seen) > 30000) q.run('UPDATE sessions SET last_seen = ? WHERE id_hash = ?', new Date(now).toISOString(), s.id_hash);
  return s;
}
function destroySession(token) { if (token) q.run('UPDATE sessions SET revoked = 1 WHERE id_hash = ?', sha(token)); }
function revokeUserSessions(userId, exceptToken) {
  q.run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0 AND id_hash != ?', userId, exceptToken ? sha(exceptToken) : '');
}
function revokeCustomerSessions(customerId) { q.run('UPDATE sessions SET revoked = 1 WHERE customer_id = ? AND revoked = 0', customerId); }
function purgeSessions() { q.run("DELETE FROM sessions WHERE revoked = 1 OR expires_at < ?", nowIso()); }

/** Resolve staff user and customer for a request from its cookies. */
function actors(ctx) {
  ctx.user = null; ctx.customer = null;
  const s = lookupSession('staff', ctx.cookies[COOKIE]);
  if (s) {
    const u = q.get('SELECT * FROM users WHERE id = ? AND active = 1', s.user_id);
    if (u) { delete u.password_hash; ctx.user = u; }
  }
  const c = lookupSession('customer', ctx.cookies[CUSTOMER_COOKIE]);
  if (c) {
    const cu = q.get('SELECT id, phone, name, email, lang FROM customers WHERE id = ?', c.customer_id);
    if (cu) ctx.customer = { ...cu, role: 'customer' };
  }
}

function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, role: u.role, showroom_id: u.showroom_id, workshop_id: u.workshop_id, phone: u.phone, must_change_password: !!u.must_change_password };
}
function whoami(u) {
  return { user: publicUser(u), role: u.role, permissions: [...perms.permsOf(u.role)].sort(), scope: { showroom_id: u.showroom_id || null, workshop_id: u.workshop_id || null }, must_change_password: !!u.must_change_password };
}

// ------------------------------------------------------------------ login throttling (in-memory): 5 failures per ip+email => 15 min lock
const fails = new Map();
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
function throttleCheck(key) {
  const f = fails.get(key);
  if (f && f.until && f.until > Date.now()) throw httpError(429, 'Too many failed attempts. Try again in a few minutes.');
}
function throttleFail(key) {
  const f = fails.get(key) || { n: 0, until: 0 };
  if (f.until && f.until < Date.now()) { f.n = 0; f.until = 0; }
  f.n++;
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(key, f);
}
function audit(email, userId, action, detail) {
  q.run('INSERT INTO audit_log(user_id,user_email,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)', userId, email, action, 'auth', String(userId || ''), detail ? JSON.stringify(detail) : null, nowIso());
}
function login(email, password, ip) {
  const key = `${ip}|${String(email).toLowerCase()}`;
  try { throttleCheck(key); } catch (e) { audit(String(email).slice(0, 120), null, 'login_locked', { ip }); throw e; }
  const u = q.get('SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1', String(email || ''));
  const ok = verifyPassword(password || '', u ? u.password_hash : DUMMY);
  if (!u || !ok) { throttleFail(key); audit(String(email || '').slice(0, 120), u ? u.id : null, 'login_failed', { ip }); throw httpError(401, 'Invalid email or password'); }
  fails.delete(key);
  q.run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), u.id);
  audit(u.email, u.id, 'login', { ip });
  return u;
}
function resetThrottle() { fails.clear(); }

function changePassword(user, current, next, currentToken) {
  const u = q.get('SELECT * FROM users WHERE id = ?', user.id);
  if (!verifyPassword(current || '', u.password_hash)) { audit(u.email, u.id, 'password_change_failed', null); throw httpError(401, 'Current password is incorrect'); }
  checkPolicy(next);
  if (next === current) throw httpError(422, 'New password must be different', { password: 'Must differ from the current password' });
  q.run('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ? WHERE id = ?', hashPassword(next), nowIso(), u.id);
  revokeUserSessions(u.id);
  audit(u.email, u.id, 'password_changed', null);
}

/**
 * Guard a route by permission. perm: 'public' | 'authenticated' (any staff) | 'perm.name' | ['any','of'].
 * Order: 401 (not logged in) -> 403 (permission / must-change-password) -> CSRF (JSON content-type or X-Requested-With) -> handler.
 * Permissions starting with `customer.` are checked against the customer session, never the staff one.
 */
function guard(perm, handler, opts = {}) {
  const list = [].concat(perm);
  const customerRoute = list.every(p => String(p).startsWith('customer.'));
  const fn = async ctx => {
    const actor = customerRoute ? ctx.customer : ctx.user;
    if (!actor) throw httpError(401, 'Login required');
    if (perm !== 'authenticated' && !perms.can(actor, perm)) throw httpError(403, 'Not permitted for your role');
    if (!customerRoute && actor.must_change_password && !opts.allowPasswordChange) throw Object.assign(httpError(403, 'You must change your password first'), { errors: { code: 'password_change_required' } });
    const m = ctx.req.method;
    if (m !== 'GET' && m !== 'HEAD') {
      const ct = String(ctx.req.headers['content-type'] || '');
      if (!/application\/json/i.test(ct) && !ctx.req.headers['x-requested-with']) throw httpError(403, 'CSRF check failed: send JSON or X-Requested-With');
    }
    return handler(ctx);
  };
  fn.perm = perm;
  return fn;
}
function open(handler) { handler.perm = 'public'; return handler; }

module.exports = {
  COOKIE, CUSTOMER_COOKIE, MIN_PASSWORD, hashPassword, verifyPassword, checkPolicy, tempPassword, hmac,
  createSession, lookupSession, destroySession, revokeUserSessions, revokeCustomerSessions, purgeSessions, actors,
  publicUser, whoami, login, resetThrottle, changePassword, guard, open, audit,
};
