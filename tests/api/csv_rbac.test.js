'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');
const { parseCsv, toCsv } = require('../../server/lib/csv');
let t, priya, used, admin, service, desk;
before(async () => {
  t = await start();
  priya = await t.login('priya@companya.in', 'Sales@123');
  used = await t.login('used@companya.in', 'Used@123');
  admin = await t.login('admin@companya.in', 'Admin@123');
  service = await t.login('service@companya.in', 'Service@123');
  desk = await t.login('desk@companya.in', 'Desk@123');
});
after(() => t.close());

test('CSV parser: quotes, escaped quotes, embedded newlines, CRLF, BOM, delimiters', () => {
  const rows = parseCsv('﻿Name,Note\r\n"Smith, J","He said ""hi""\nline2"\r\nPlain,x\r\n');
  assert.deepEqual(rows, [['Name', 'Note'], ['Smith, J', 'He said "hi"\nline2'], ['Plain', 'x']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.throws(() => parseCsv('a,b\n"oops,1'));
  assert.match(toCsv(['a'], [{ a: '=SUM(1)' }]), /'=SUM/);
});

const CSV = [
  'Customer Name,Mobile No.,E-mail,Interested Model,City,Remarks',
  'Rohit Sharma,+91 98111 22201,rohit@example.com,Model S,Lucknow,"Want test drive, this week"',
  'Seema Rai,9811122202,,Model H ZX,Kanpur,',
  'Rohit Sharma,09811122201,,Model S,Lucknow,duplicate in file',
  'X,9811122203,,Model C,,short name',
  'Bad Phone,12345,,Model C,,',
  'Mail Bad,9811122204,not-an-email,Model C,,',
].join('\n');

test('portal CSV import: dry run, mapping, dedupe, per-row errors, then real import', async () => {
  const dry = await t.api('POST', '/api/staff/leads/import', { csv: CSV, source: 'carwale', dryRun: true }, { cookie: desk });
  assert.equal(dry.status, 200);
  assert.equal(dry.json.created, 2); assert.equal(dry.json.duplicates, 1);
  assert.deepEqual(dry.json.errors.map(e => e.row).sort(), [5, 6, 7]);
  assert.equal(dry.json.mapping.phone, 'Mobile No.');
  assert.equal(t.db.q.get('SELECT COUNT(*) c FROM leads WHERE phone = ?', '9811122201').c, 0); // nothing written
  const real = await t.api('POST', '/api/staff/leads/import', { csv: CSV, source: 'carwale', dryRun: false }, { cookie: desk });
  assert.equal(real.json.created, 2);
  const row = t.db.q.get('SELECT * FROM leads WHERE phone = ?', '9811122201');
  assert.equal(row.source, 'carwale'); assert.ok(row.assigned_to); assert.equal(row.model_id, 3);
  // re-import: all valid rows are now duplicates (same phone+model within 7 days)
  const again = await t.api('POST', '/api/staff/leads/import', { csv: CSV, source: 'carwale', dryRun: false }, { cookie: desk });
  assert.equal(again.json.created, 0); assert.equal(again.json.duplicates, 3);
  assert.equal((await t.api('POST', '/api/staff/leads/import', { csv: 'foo,bar\n1,2', source: 'carwale' }, { cookie: desk })).status, 422);
});

test('RBAC: anonymous, wrong role, CSRF', async () => {
  assert.equal((await t.api('GET', '/api/staff/leads')).status, 401);
  assert.equal((await t.api('GET', '/api/admin/users', undefined, { cookie: priya })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/price-rules', undefined, { cookie: priya })).status, 403);
  assert.equal((await t.api('GET', '/api/staff/leads', undefined, { cookie: service })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/users', undefined, { cookie: used })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/export/dms.csv', undefined, { cookie: used })).status, 403);
  // CSRF: authenticated state change without JSON content-type or X-Requested-With is refused
  const res = await fetch(t.base + '/api/staff/leads/1', { method: 'PATCH', headers: { cookie: priya, 'content-type': 'text/plain' }, body: '{"status":"lost"}' });
  assert.equal(res.status, 403);
});

test('RBAC: consultant cannot see AI used-price suggestion; used_manager/admin can', async () => {
  const car = t.db.q.get("SELECT id FROM used_cars WHERE stock_id = 'UC-1182'");
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}/suggestion`, undefined, { cookie: priya })).status, 403);
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}`, undefined, { cookie: priya })).status, 403);
  const s = await t.api('GET', `/api/admin/used/${car.id}/suggestion`, undefined, { cookie: used });
  assert.equal(s.status, 200);
  assert.ok(s.json.comps > 0 && s.json.low <= s.json.mid && s.json.mid <= s.json.high);
  assert.equal((await t.api('GET', `/api/admin/used/${car.id}/suggestion`, undefined, { cookie: admin })).status, 200);
  // never in public or lead payloads
  assert.ok(!/suggestion|"mid"/.test((await t.api('GET', '/api/used/UC-1182')).text));
  const lead = t.db.q.get('SELECT id FROM leads LIMIT 1');
  const detail = await t.api('GET', `/api/staff/leads/${lead.id}`, undefined, { cookie: admin });
  assert.ok(!/"comps"|"suggestion"/.test(detail.text));
});

test('masked registration number never leaks in public API', async () => {
  const regs = t.db.q.all('SELECT reg_no FROM used_cars').map(r => r.reg_no);
  const bodies = [(await t.api('GET', '/api/used?pageSize=60')).text, (await t.api('GET', '/api/used?status=sold')).text];
  for (const c of t.db.q.all('SELECT stock_id FROM used_cars')) bodies.push((await t.api('GET', '/api/used/' + c.stock_id)).text);
  for (const b of bodies) for (const r of regs) {
    assert.ok(!b.includes(r), 'full reg leaked: ' + r);
    assert.ok(!b.includes(r.slice(0, 4) + ' ' + r.slice(4)));
  }
  assert.ok(bodies[2].includes('UP32 •• ••'));
  assert.ok(!bodies[0].includes('reg_no'));
});

test('admin CRUD + audit log + DMS export + sitemap helper', async () => {
  const c = await t.api('POST', '/api/admin/offers', { title_en: 'Test offer', type: 'cash', amount: 5000, show_in_onroad: true }, { cookie: admin });
  assert.equal(c.status, 201);
  assert.equal((await t.api('PUT', `/api/admin/offers/${c.json.id}`, { amount: 7000 }, { cookie: admin })).json.amount, 7000);
  assert.equal((await t.api('POST', '/api/admin/offers', { title_en: 'x', type: 'bogus' }, { cookie: admin })).status, 422);
  assert.equal((await t.api('DELETE', `/api/admin/offers/${c.json.id}`, undefined, { cookie: admin })).status, 200);
  const u = await t.api('POST', '/api/admin/users', { name: 'New Person', email: 'new@companya.in', role: 'consultant', password: 'Vx9#kLm2$Qz', showroom_id: 1 }, { cookie: admin });
  assert.equal(u.status, 201); assert.ok(!('password_hash' in u.json));
  assert.ok((await t.login('new@companya.in', 'Vx9#kLm2$Qz')));
  const audit = (await t.api('GET', '/api/admin/audit', undefined, { cookie: admin })).json;
  assert.ok(audit.some(a => a.entity === 'offers' && a.action === 'update'));
  assert.ok(audit.some(a => a.entity === 'users' && a.action === 'create'));
  assert.ok(!JSON.stringify(audit).includes('Vx9#kLm2'));
  const csv = await t.api('GET', '/api/admin/export/dms.csv?date=' + new Date().toISOString().slice(0, 10), undefined, { cookie: admin });
  assert.equal(csv.status, 200); assert.match(csv.text, /^record_type,id,date/);
  const urls = require('../../server/services/seo').listAllUrls();
  assert.ok(urls.some(x => x.loc === '/new-cars/model-h') && urls.some(x => x.loc === '/used-cars/uc-1182-model-c-vx-2022'));
  assert.ok(!urls.some(x => x.loc.includes('1203'))); // sold car excluded
});

test('login throttling, logout, /api/me, healthz, upload', async () => {
  assert.equal((await t.api('GET', '/healthz')).json.ok, true);
  assert.equal((await t.api('GET', '/api/me')).status, 401);
  assert.equal((await t.api('GET', '/api/me', undefined, { cookie: priya })).json.user.role, 'consultant');
  for (let i = 0; i < 5; i++) assert.equal((await t.api('POST', '/api/auth/login', { email: 'rahul@companya.in', password: 'wrong' })).status, 401);
  assert.equal((await t.api('POST', '/api/auth/login', { email: 'rahul@companya.in', password: 'Sales@123' })).status, 429);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = await t.api('POST', '/api/admin/upload', { dataUrl: png, name: 'x.png' }, { cookie: admin });
  assert.equal(up.status, 201);
  const f = await fetch(t.base + up.json.url);
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png');
  assert.equal((await t.api('POST', '/api/admin/upload', { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', name: 'x.svg' }, { cookie: admin })).status, 422);
});
