'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');
let t, admin;
before(async () => { t = await start(); admin = await t.login('admin@companya.in', 'Admin@123'); });
after(() => t.close());

test('EMI math', async () => {
  const r = await t.api('GET', '/api/emi?principal=1000000&rate=10&months=60&downPayment=200000');
  assert.equal(r.status, 200);
  assert.equal(r.json.loan, 800000);
  assert.equal(r.json.emi, 16998);
  assert.equal(r.json.total_payable, r.json.emi * 60);
  assert.equal((await t.api('GET', '/api/emi?principal=-5&months=12')).status, 400);
});

test('on-road price is computed purely from admin tables', async () => {
  // Create an isolated city + rule + variant-independent numbers, then verify by hand.
  const city = await t.api('POST', '/api/admin/cities', { name_en: 'Testville', slug: 'testville' }, { cookie: admin });
  assert.equal(city.status, 201);
  const rule = await t.api('POST', '/api/admin/price-rules', {
    city_id: city.json.id, road_tax_pct: 5, road_tax_pct_high: 12, road_tax_threshold: 1000000, registration_fee: 2000, insurance_pct: 3,
    handling: 1000, fastag: 500, tcs_pct: 1, tcs_threshold: 1000000, valid_until: '2099-01-01' }, { cookie: admin });
  assert.equal(rule.status, 201);
  const variants = (await t.api('GET', '/api/admin/variants', undefined, { cookie: admin })).json;
  const low = variants.find(v => v.ex_showroom <= 1000000) , high = variants.find(v => v.code === 'NEW-H-02');
  // below threshold: lower road tax %, no TCS
  if (low) {
    const r = await t.api('GET', `/api/onroad?variant=${low.id}&city=testville`);
    const ex = low.ex_showroom;
    const exp = ex + Math.round(ex * 0.05) + 2000 + Math.round(ex * 0.03) + 1000 + 500 - (r.json.lines.filter(l => l.kind === 'less').reduce((a, l) => a + l.amount, 0));
    assert.equal(r.json.on_road, exp);
    assert.ok(!r.json.lines.find(l => l.key === 'tcs'));
  }
  // NEW-H-02: 12,45,000 -> high band + TCS
  const r = await t.api('GET', `/api/onroad?variant=${high.id}&city=testville`);
  const ex = 1245000;
  const less = r.json.lines.filter(l => l.kind === 'less').reduce((a, l) => a + l.amount, 0);
  assert.equal(r.json.on_road, ex + 149400 + 2000 + 37350 + 1000 + 500 + 12450 - less);
  assert.equal(r.json.lines.at(-1).kind, 'total');
  assert.equal(r.json.expired, false);
  // accessories toggle comes from the model row
  const withAcc = await t.api('GET', `/api/onroad?variant=${high.id}&city=testville&accessories=1`);
  assert.equal(withAcc.json.on_road - r.json.on_road, 18500);
  // changing the admin rule changes the price (no hard-coding)
  await t.api('PUT', `/api/admin/price-rules/${rule.json.id}`, { handling: 3000 }, { cookie: admin });
  const r2 = await t.api('GET', `/api/onroad?variant=${high.id}&city=testville`);
  assert.equal(r2.json.on_road - r.json.on_road, 2000);
  // expiry flag
  await t.api('PUT', `/api/admin/price-rules/${rule.json.id}`, { valid_until: '2020-01-01' }, { cookie: admin });
  assert.equal((await t.api('GET', `/api/onroad?variant=${high.id}&city=testville`)).json.expired, true);
});

test('cash offer with show_in_onroad is deducted, others are not', async () => {
  const h2 = (await t.api('GET', '/api/models/model-h')).json.variants.find(v => v.code === 'NEW-H-02');
  const r = await t.api('GET', `/api/onroad?variant=${h2.id}&city=lucknow`);
  const less = r.json.lines.filter(l => l.kind === 'less');
  assert.equal(less.length, 1);
  assert.equal(less[0].amount, 15000);
  const s = (await t.api('GET', '/api/models/model-s')).json.variants[0];
  assert.equal((await t.api('GET', `/api/onroad?variant=${s.id}&city=lucknow`)).json.lines.filter(l => l.kind === 'less').length, 0);
});

test('seeded sample data present', async () => {
  assert.ok((await t.api('GET', '/api/models')).json.length === 4);
  const u = (await t.api('GET', '/api/used/UC-1182')).json;
  assert.equal(u.price, 845000); assert.equal(u.status, 'available');
  assert.equal((await t.api('GET', '/api/used/uc-1190-model-s-lx-2021')).json.status, 'booked');
  assert.equal(u.inspection.sections.reduce((n, s) => n + s.items.length, 0), 100);
});
