'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');
let t;
before(async () => { t = await start(); });
after(() => t.close());

const form = (o) => new URLSearchParams(o).toString();
const post = (body) => fetch(t.base + '/api/leads', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });

test('D-03: CR/LF or unsafe _next never causes 500', async () => {
  const base = { name: 'Form Person', phone: '9744444441', consent: 'on' };
  for (const bad of ['/contact\r\nSet-Cookie: x=1', '//evil.com', 'https://evil.com', '/\evil.com']) {
    const r = await post(form({ ...base, _next: bad }));
    assert.ok(r.status < 400, 'status ' + r.status);
    assert.ok(!r.headers.get('set-cookie'));
    const loc = r.headers.get('location');
    assert.ok(!loc || /^\/[^/]/.test(loc));
  }
  const ok = await post(form({ ...base, phone: '9744444442', _next: '/contact?x=1' }));
  assert.equal(ok.status, 303); assert.equal(ok.headers.get('location'), '/contact?x=1&ok=1');
});

test('D-09: sold cars hidden from anonymous list, visible to staff', async () => {
  const anon = (await t.api('GET', '/api/used?status=sold')).json;
  assert.ok(anon.items.every(c => c.status !== 'sold'));
  assert.ok(!(await t.api('GET', '/api/used?pageSize=60')).json.items.some(c => c.status === 'sold'));
  const admin = await t.login('admin@companya.in', 'Admin@123');
  const staff = (await t.api('GET', '/api/used?status=sold', undefined, { cookie: admin })).json;
  assert.ok(staff.items.length >= 1 && staff.items.every(c => c.status === 'sold'));
});

test('D-10: specialty is a preference; heavily loaded specialist/generalist loses', async () => {
  const gomti = (await t.api('GET', '/api/showrooms')).json.find(s => s.slug === 'gomti-nagar').id;
  const H = (await t.api('GET', '/api/models')).json.find(m => m.slug === 'model-h').id;
  const priya = t.db.q.get("SELECT id FROM users WHERE email='priya@companya.in'").id;
  const rahul = t.db.q.get("SELECT id FROM users WHERE email='rahul@companya.in'").id;
  t.db.q.run("UPDATE leads SET status='won' WHERE assigned_to IN (?,?)", priya, rahul);
  const { pickAssignee } = require('../../server/services/leads');
  assert.equal(pickAssignee(gomti, H).id, priya); // preferred (non-specialist for H is Rahul)
  for (let i = 0; i < 8; i++) t.db.q.run("INSERT INTO leads(source,type,name,phone,status,assigned_to,created_at,due_at,updated_at) VALUES ('website','enquiry','Load Test','9755555555','new',?,?,?,?)", priya, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  assert.equal(pickAssignee(gomti, H).id, rahul);
});
