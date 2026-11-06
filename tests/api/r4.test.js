'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');

const ROOT = path.resolve(__dirname, '..', '..');
const run = (args, env) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', ...args], { cwd: ROOT, env: { ...process.env, LOG: '0', ...env }, encoding: 'utf8', timeout: 30000 });
const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cam-r4-')), 'app.db');
const one = (file, sql) => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare(sql).get(); } finally { d.close(); } };
const GOOD = 'Vx9#kLm2$Qz-prod';

test('R4-02: production never auto-seeds demo users; fails clearly without a bootstrap admin', () => {
  const db = tmpDb();
  const r = run(['server/server.js'], { NODE_ENV: 'production', DB_PATH: db, PORT: '0', BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No admin user exists/);
  assert.equal(one(db, "SELECT COUNT(*) c FROM users WHERE email = 'admin@companya.in'").c, 0);
  assert.equal(one(db, 'SELECT COUNT(*) c FROM users').c, 0);
  const s = run(['server/seed.js'], { NODE_ENV: 'production', DB_PATH: tmpDb() });
  assert.notEqual(s.status, 0); assert.match(s.stderr, /Refusing to seed demo data in production/);
});

test('R4-02: --bootstrap creates reference data and exactly one admin who must change the password', () => {
  const db = tmpDb();
  const weak = run(['server/seed.js', '--bootstrap'], { NODE_ENV: 'production', DB_PATH: db, BOOTSTRAP_ADMIN_EMAIL: 'owner@dealer.example', BOOTSTRAP_ADMIN_PASSWORD: 'Admin@123' });
  assert.notEqual(weak.status, 0); assert.match(weak.stderr, /rejected/);
  const ok = run(['server/seed.js', '--bootstrap'], { NODE_ENV: 'production', DB_PATH: db, BOOTSTRAP_ADMIN_EMAIL: 'owner@dealer.example', BOOTSTRAP_ADMIN_PASSWORD: GOOD });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(!ok.stdout.includes(GOOD));
  const u = one(db, 'SELECT COUNT(*) c, MIN(email) e, MIN(role) r, MIN(must_change_password) m, MIN(password_hash) h FROM users');
  assert.deepEqual([u.c, u.e, u.r, u.m], [1, 'owner@dealer.example', 'admin', 1]);
  assert.ok(u.h.startsWith('scrypt$') && !u.h.includes(GOOD));
  for (const [tbl, min] of [['showrooms', 3], ['workshops', 2], ['cities', 6], ['roles', 9]]) assert.ok(one(db, `SELECT COUNT(*) c FROM ${tbl}`).c >= min, tbl);
  for (const tbl of ['leads', 'customers', 'models', 'used_cars', 'bookings']) assert.equal(one(db, `SELECT COUNT(*) c FROM ${tbl}`).c, 0, tbl);
  // idempotent
  assert.match(run(['server/seed.js', '--bootstrap'], { NODE_ENV: 'production', DB_PATH: db, BOOTSTRAP_ADMIN_PASSWORD: GOOD }).stdout, /already exists/);
  // generated password path prints a one-time password
  const db2 = tmpDb();
  const gen = run(['server/seed.js', '--bootstrap'], { NODE_ENV: 'production', DB_PATH: db2, BOOTSTRAP_ADMIN_EMAIL: 'o2@dealer.example', BOOTSTRAP_ADMIN_PASSWORD: '' });
  assert.equal(gen.status, 0, gen.stderr); assert.match(gen.stdout, /Temporary password \(shown once/);
});

test('R4-02: production boot with bootstrap env: forced password change, demo logins do not exist', async () => {
  const db = tmpDb();
  const port = 41000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LOG: '0', NODE_ENV: 'production', DB_PATH: db, PORT: String(port), SESSION_SECRET: 'x'.repeat(40), BOOTSTRAP_ADMIN_EMAIL: 'owner@dealer.example', BOOTSTRAP_ADMIN_PASSWORD: GOOD } });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
    const post = (u, b, h = {}) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
    assert.equal((await post('/api/auth/login', { email: 'admin@companya.in', password: 'Admin@123' })).status, 401);
    const l = await post('/api/auth/login', { email: 'owner@dealer.example', password: GOOD });
    assert.equal(l.status, 200); assert.equal((await l.json()).must_change_password, true);
    const cookie = l.headers.get('set-cookie').split(';')[0];
    const blocked = await fetch(base + '/api/admin/users', { headers: { cookie } });
    assert.equal(blocked.status, 403); assert.equal((await blocked.json()).errors.code, 'password_change_required');
    const otp = await post('/api/customer/otp/request', { phone: '9800000000' });
    assert.equal(otp.status, 503); assert.ok(!/dev_otp/.test(await otp.text()));
  } finally { child.kill(); }
});

let t, ce, admin;
before(async () => { t = await start(); ce = await t.login('content@companya.in', 'Content@123'); admin = await t.login('admin@companya.in', 'Admin@123'); });
after(() => t.close());

test('R4-03: every on-road-affecting field of a cash offer, model or variant needs the price permission', async () => {
  const offer = () => t.db.q.get('SELECT * FROM offers WHERE id = 1');
  const was = offer();
  assert.equal(was.type, 'cash');
  const put = (url, b, c = ce) => t.api('PUT', url, b, { cookie: c });
  for (const body of [{ active: 0 }, { model_id: null }, { model_id: 2 }, { valid_until: '2031-01-01' }, { valid_until: null }, { amount: 77777 }, { amount: 0 }, { type: 'info' }, { show_in_onroad: 0 }])
    assert.equal((await put('/api/admin/offers/1', body)).status, 403, JSON.stringify(body));
  assert.deepEqual(offer(), was);
  assert.equal((await put('/api/admin/offers/1', { title_en: 'Copy edit only', body_en: 'x', active: was.active, model_id: was.model_id, amount: was.amount })).status, 200);
  assert.equal((await t.api('DELETE', '/api/admin/offers/1', undefined, { cookie: ce })).status, 403);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'New cash', type: 'cash', amount: 1, show_in_onroad: true }, { cookie: ce })).status, 403);
  // info offers: copy and active flag are free, but turning them into cash is not
  const info = t.db.q.get("SELECT id FROM offers WHERE type = 'info' LIMIT 1").id;
  assert.equal((await put(`/api/admin/offers/${info}`, { active: 0 })).status, 200);
  assert.equal((await put(`/api/admin/offers/${info}`, { active: 1 })).status, 200);
  assert.equal((await put(`/api/admin/offers/${info}`, { type: 'cash' })).status, 403);
  assert.equal((await put(`/api/admin/offers/${info}`, { amount: 5 })).status, 403);
  // models: accessories and active flag
  assert.equal((await put('/api/admin/models/1', { active: 0 })).status, 403);
  assert.equal((await t.api('DELETE', '/api/admin/models/4', undefined, { cookie: ce })).status, 403);
  // variants (all fields) and rules
  for (const body of [{ active: 0 }, { name: 'Renamed' }, { ex_showroom: 1 }, { model_id: 2 }]) assert.equal((await put('/api/admin/variants/1', body)).status, 403, JSON.stringify(body));
  for (const body of [{ active: 0 }, { city_id: 2 }, { valid_until: '2020-01-01' }]) assert.equal((await put('/api/admin/price-rules/1', body)).status, 403, JSON.stringify(body));
  // the on-road price is untouched and admin can still edit
  const h2 = (await t.api('GET', '/api/models/model-h')).json.variants.find(v => v.code === 'NEW-H-02');
  assert.equal((await t.api('GET', `/api/onroad?variant=${h2.id}&city=lucknow`)).json.lines.filter(l => l.kind === 'less').length, 1);
  assert.equal((await put('/api/admin/offers/1', { active: 0 }, admin)).status, 200);
  assert.equal((await put('/api/admin/offers/1', { active: 1 }, admin)).status, 200);
});

test('used cars: real photos only, every car has one, SVG URLs never exposed', async () => {
  const fixture = require('../../server/services/used');
  const list = (await t.api('GET', '/api/used?pageSize=60')).json.items.concat((await t.api('GET', '/api/used?status=sold', undefined, { cookie: admin })).json.items);
  assert.ok(list.length >= 15);
  for (const c of list) {
    assert.match(c.photo, /^\/img\/used\/uc-\d{4}\.jpg$/, c.stock_id);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', c.photo)), c.photo);
  }
  const d = (await t.api('GET', '/api/used/UC-1188')).json;
  assert.ok(d.photos.length >= 1 && d.photos.every(u => /\.jpg$/.test(u)));
  // stale SVG rows are filtered in the API and repaired by the fix-up
  t.db.q.run("UPDATE used_cars SET photos = '[\"/img/car/model-s.svg?c=ffffff\"]' WHERE stock_id = 'UC-1188'");
  assert.ok(!(await t.api('GET', '/api/used/UC-1188')).text.includes('.svg'));
  assert.ok(!(await t.api('GET', '/api/used?pageSize=60')).text.includes('.svg'));
  require('../../server/seed').fixups();
  assert.ok(!t.db.q.get("SELECT photos p FROM used_cars WHERE stock_id = 'UC-1188'").p.includes('.svg'));
  assert.equal(fixture.photoFor('UC-9999', 'Model V').startsWith('/img/used/'), true);
  // admin-created cars get a real photo by default
  const c = await t.api('POST', '/api/admin/used', { model: 'Model H', variant: 'LX', year: 2020, km: 1000, fuel: 'Petrol', transmission: 'Manual', price: 300000 }, { cookie: admin });
  assert.equal(c.status, 201); assert.ok(c.json.photos.length === 1 && /\.jpg$/.test(c.json.photos[0]));
});
