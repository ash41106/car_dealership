'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { q, dataDir } = require('./db');
const { httpError } = require('./util');

const COOKIE = 'sid';
const TTL_MS = 8 * 3600 * 1000;
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

function sign(data) { return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url'); }
function makeToken(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readToken(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const [payload, sig] = tok.split('.');
  if (!payload || !sig) return null;
  const exp = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return p.e > Date.now() ? p.u : null;
  } catch { return null; }
}

function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, role: u.role, showroom_id: u.showroom_id, phone: u.phone };
}
function userFromCookie(cookies) {
  const id = readToken(cookies[COOKIE]);
  if (!id) return null;
  const u = q.get('SELECT * FROM users WHERE id = ? AND active = 1', id);
  return u || null;
}

// --- login throttling (in-memory): 5 failures per ip+email => 15 min lock
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
function login(email, password, ip) {
  const key = `${ip}|${String(email).toLowerCase()}`;
  throttleCheck(key);
  const u = q.get('SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1', String(email || ''));
  const ok = verifyPassword(password || '', u ? u.password_hash : DUMMY);
  if (!u || !ok) { throttleFail(key); throw httpError(401, 'Invalid email or password'); }
  fails.delete(key);
  return u;
}
function resetThrottle() { fails.clear(); }

const ROLES = ['admin', 'used_manager', 'consultant', 'service_advisor'];

/** Wrap a handler with authentication, RBAC and CSRF (JSON content-type or X-Requested-With). */
function guard(roles, handler) {
  return async ctx => {
    if (!ctx.user) throw httpError(401, 'Login required');
    if (roles && roles.length && !roles.includes(ctx.user.role) && ctx.user.role !== 'admin') throw httpError(403, 'Not permitted for your role');
    const m = ctx.req.method;
    if (m !== 'GET' && m !== 'HEAD') {
      const ct = String(ctx.req.headers['content-type'] || '');
      if (!/application\/json/i.test(ct) && !ctx.req.headers['x-requested-with']) throw httpError(403, 'CSRF check failed: send JSON or X-Requested-With');
    }
    return handler(ctx);
  };
}

module.exports = { COOKIE, TTL_MS, hashPassword, verifyPassword, makeToken, readToken, userFromCookie, publicUser, login, resetThrottle, guard, ROLES };
