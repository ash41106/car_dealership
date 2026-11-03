'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, futureDate } = require('./_helper');
let t;
before(async () => { t = await start(); });
after(() => t.close());

const person = (i, extra = {}) => ({ name: 'Test Buyer ' + i, phone: '98' + String(10000000 + i), consent: true, ...extra });

test('test-drive slots: double booking impossible (409), concurrent safe', async () => {
  const date = futureDate(4);
  // Alambagh has ONE demo Model C
  const sr = (await t.api('GET', '/api/showrooms')).json.find(s => s.slug === 'alambagh');
  const model = (await t.api('GET', '/api/models')).json.find(m => m.slug === 'model-c');
  const q = `/api/slots/test-drive?showroom=${sr.id}&model=${model.id}&date=${date}`;
  const before = (await t.api('GET', q)).json;
  assert.ok(before.every(s => s.available));
  const body = i => person(i, { showroomId: sr.id, modelId: model.id, date, time: '11:00' });
  const results = await Promise.all([1, 2, 3, 4, 5].map(i => t.api('POST', '/api/test-drive', body(i))));
  const ok = results.filter(r => r.status === 201), conflict = results.filter(r => r.status === 409);
  assert.equal(ok.length, 1);
  assert.equal(conflict.length, 4);
  assert.ok(ok[0].json.assignee.name);
  assert.equal(ok[0].json.lead.source, 'test_drive');
  const after = (await t.api('GET', q)).json;
  assert.equal(after.find(s => s.time === '11:00').available, false);
  assert.equal(after.find(s => s.time === '12:00').available, true);
  // cancelling frees the slot
  const staff = await t.login('amit@companya.in', 'Sales@123');
  await t.api('PATCH', `/api/staff/bookings/${ok[0].json.booking.id}`, { status: 'cancelled' }, { cookie: staff });
  assert.equal((await t.api('POST', '/api/test-drive', body(9))).status, 201);
});

test('two demo cars at Gomti Nagar Model H allow two bookings in a slot, not three', async () => {
  const date = futureDate(5);
  const sr = (await t.api('GET', '/api/showrooms')).json.find(s => s.slug === 'gomti-nagar');
  const m = (await t.api('GET', '/api/models')).json.find(x => x.slug === 'model-h');
  const book = i => t.api('POST', '/api/test-drive', person(20 + i, { showroomId: sr.id, modelId: m.id, date, time: '10:00' }));
  assert.equal((await book(1)).status, 201);
  assert.equal((await book(2)).status, 201);
  assert.equal((await book(3)).status, 409);
});

test('test drive validation: consent, phone, past date', async () => {
  const sr = (await t.api('GET', '/api/showrooms')).json[0];
  const base = person(50, { showroomId: sr.id, modelId: 1, date: futureDate(6), time: '15:00' });
  assert.equal((await t.api('POST', '/api/test-drive', { ...base, consent: false })).status, 422);
  assert.equal((await t.api('POST', '/api/test-drive', { ...base, phone: '12345' })).status, 422);
  assert.equal((await t.api('POST', '/api/test-drive', { ...base, date: '2020-01-01' })).status, 422);
  assert.equal((await t.api('POST', '/api/test-drive', { ...base, time: '03:00' })).status, 422);
});

test('service bay capacity respected', async () => {
  const date = futureDate(7);
  const ws = (await t.api('GET', '/api/workshops')).json.find(w => w.slug === 'gomti-nagar-extension');
  assert.equal(ws.bays, 4);
  const slots = (await t.api('GET', `/api/slots/service?workshop=${ws.id}&date=${date}`)).json;
  assert.equal(slots.find(s => s.time === '10:00').remaining, 4);
  const book = i => t.api('POST', '/api/service', person(100 + i, { regNo: `UP32AB${1000 + i}`, model: 'Model H', workshopId: ws.id, date, time: '10:00', serviceType: 'periodic' }));
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(book));
  assert.equal(rs.filter(r => r.status === 201).length, 4);
  assert.equal(rs.filter(r => r.status === 409).length, 2);
  assert.equal((await t.api('GET', `/api/slots/service?workshop=${ws.id}&date=${date}`)).json.find(s => s.time === '10:00').remaining, 0);
  const ok = rs.find(r => r.status === 201).json.booking;
  assert.match(ok.reg_masked, /^UP32 •• ••\d\d$/);
  assert.ok(!JSON.stringify(ok).includes('UP32AB10'));
  assert.equal((await t.api('POST', '/api/service', person(200, { regNo: 'XX', workshopId: ws.id, date, time: '11:00' }))).status, 422);
});
