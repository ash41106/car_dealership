'use strict';
// Shared test harness: temp DB, random port, in-process server. Each test file runs in its own process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-test-'));
process.env.DB_PATH = path.join(dir, 'app.db');
process.env.LOG = '0';
process.env.MSG_LOG = '0';
process.env.RATE_LIMIT_PUBLIC = '100000';
process.env.SESSION_SECRET = 'test-secret';
delete process.env.ANTHROPIC_API_KEY;
const { createApp } = require('../../server/server');

async function start() {
  const app = createApp();
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function api(method, url, body, { cookie, headers } = {}) {
    const h = { ...(headers || {}) };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (cookie) { h.cookie = cookie; h['x-requested-with'] = 'fetch'; }
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }
  async function login(email, password) {
    const r = await api('POST', '/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error('login failed ' + r.status);
    return r.headers.get('set-cookie').split(';')[0];
  }
  async function customer(phone, otp = '123456') {
    const r = await api('POST', '/api/customer/otp/verify', { phone, otp, name: 'Test Customer' });
    if (r.status !== 200) throw new Error('customer login failed ' + r.status + ' ' + r.text);
    return r.headers.get('set-cookie').split(';')[0];
  }
  const db = require('../../server/lib/db');
  return { app, base, api, login, customer, db, close: () => app.close() };
}
const futureDate = (n = 3) => new Date(Date.now() + 5.5 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
module.exports = { start, futureDate };
