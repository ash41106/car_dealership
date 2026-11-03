'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helper');
let t, ids = {};
before(async () => {
  t = await start();
  ids.sr = Object.fromEntries((await t.api('GET', '/api/showrooms')).json.map(s => [s.slug, s.id]));
  ids.m = Object.fromEntries((await t.api('GET', '/api/models')).json.map(m => [m.slug, m.id]));
});
after(() => t.close());
let n = 0;
const lead = (extra = {}) => ({ name: 'Lead Person ' + (++n), phone: '97' + String(20000000 + n), consent: true, message: 'Interested', ...extra });

test('consent is required, stored with hash/lang/timestamp', async () => {
  assert.equal((await t.api('POST', '/api/leads', lead({ consent: false }))).status, 422);
  const noC = lead(); delete noC.consent;
  const r0 = await t.api('POST', '/api/leads', noC);
  assert.equal(r0.status, 422); assert.ok(r0.json.errors.consent);
  const r = await t.api('POST', '/api/leads', lead({ lang: 'hi', showroomId: ids.sr.alambagh, modelId: ids.m['model-h'] }));
  assert.equal(r.status, 201);
  const c = t.db.q.get('SELECT * FROM consents WHERE lead_id = ?', r.json.lead.id);
  assert.ok(c.text.length > 20); assert.equal(c.lang, 'hi'); assert.equal(c.ip_hash.length, 64); assert.ok(c.created_at);
});

test('phone normalisation and validation', async () => {
  const r = await t.api('POST', '/api/leads', lead({ phone: '+91 98765-43210' }));
  assert.equal(r.status, 201);
  assert.equal(t.db.q.get('SELECT phone FROM leads WHERE id = ?', r.json.lead.id).phone, '9876543210');
  assert.equal((await t.api('POST', '/api/leads', lead({ phone: '5876543210' }))).status, 422);
  assert.equal((await t.api('POST', '/api/leads', lead({ name: 'A' }))).status, 422);
  assert.equal((await t.api('POST', '/api/leads', lead({ email: 'nope' }))).status, 422);
});

test('auto-assignment: showroom + model eligibility', async () => {
  const a = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr.alambagh, modelId: ids.m['model-c'] }));
  assert.equal(a.json.assignee.name, 'Amit Yadav');
  const b = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr['gomti-nagar'], modelId: ids.m['model-h'] }));
  assert.equal(b.json.assignee.name, 'Priya Sharma'); // Rahul is S/V specialist only
});

test('auto-assignment: fewest open leads wins', async () => {
  for (let i = 0; i < 6; i++) {
    const open = Object.fromEntries(t.db.q.all("SELECT id, (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('won','lost')) c FROM users u WHERE name IN ('Priya Sharma','Rahul Verma')").map(r => [r.id, r.c]));
    const min = Math.min(...Object.values(open));
    const r = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr['gomti-nagar'], modelId: ids.m['model-s'] }));
    const got = t.db.q.get('SELECT assigned_to FROM leads WHERE id = ?', r.json.lead.id).assigned_to;
    assert.equal(open[got], min, 'assignee must have had the fewest open leads');
  }
});

test('no showroom given: city default showroom is used', async () => {
  const r = await t.api('POST', '/api/leads', lead({ city: 'kanpur', modelId: ids.m['model-v'] }));
  assert.equal(t.db.q.get('SELECT showroom_id FROM leads WHERE id = ?', r.json.lead.id).showroom_id, ids.sr.alambagh);
});

test('SLA: due_at = created + 5 min; first response; breach flag; stats', async () => {
  const r = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr.aliganj, modelId: ids.m['model-c'] }));
  const row = t.db.q.get('SELECT * FROM leads WHERE id = ?', r.json.lead.id);
  assert.equal(Date.parse(row.due_at) - Date.parse(row.created_at), 300000);
  assert.equal(row.first_response_at, null);
  const neha = await t.login('neha@companya.in', 'Sales@123');
  const d0 = (await t.api('GET', `/api/staff/leads/${row.id}`, undefined, { cookie: neha })).json;
  assert.equal(d0.lead.sla.responded, false); assert.equal(d0.lead.sla.breached, false);
  assert.ok(d0.lead.sla.remaining_sec > 200);
  assert.ok(d0.ai.summary.text && d0.ai.draft);
  assert.ok(d0.messages.some(m => m.template === 'ack_lead'));
  assert.equal((await t.api('PATCH', `/api/staff/leads/${row.id}`, { status: 'contacted' }, { cookie: neha })).status, 200);
  const d1 = (await t.api('GET', `/api/staff/leads/${row.id}`, undefined, { cookie: neha })).json;
  assert.equal(d1.lead.sla.responded, true); assert.equal(d1.lead.sla.breached, false);
  const r2 = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr.aliganj }));
  t.db.q.run('UPDATE leads SET created_at = ?, due_at = ? WHERE id = ?', new Date(Date.now() - 600000).toISOString(), new Date(Date.now() - 300000).toISOString(), r2.json.lead.id);
  const list = (await t.api('GET', '/api/staff/leads?breached=1', undefined, { cookie: neha })).json;
  assert.ok(list.items.some(l => l.id === r2.json.lead.id && l.sla.breached));
  const st = (await t.api('GET', '/api/staff/leads/stats', undefined, { cookie: neha })).json;
  assert.ok(st.breached >= 1); assert.ok('pct_within_5min' in st); assert.ok(Array.isArray(st.per_consultant));
});

test('reply requires confirmed_edit and rejects discount language; sets first response', async () => {
  const r = await t.api('POST', '/api/leads', lead({ showroomId: ids.sr.alambagh }));
  const amit = await t.login('amit@companya.in', 'Sales@123');
  const url = `/api/staff/leads/${r.json.lead.id}/reply`;
  assert.equal((await t.api('POST', url, { text: 'Hello, can we talk today?' }, { cookie: amit })).status, 422);
  for (const bad of ['You get 5% discount this week', 'Special offer just for you', 'On-road price is Rs 1400000', 'Flat Rs. 20000 off']) {
    assert.equal((await t.api('POST', url, { text: bad, confirmed_edit: true }, { cookie: amit })).status, 422, bad);
  }
  assert.equal((await t.api('POST', url, { text: 'Hello, can we talk today?', confirmed_edit: true }, { cookie: amit })).status, 200);
  assert.ok(t.db.q.get('SELECT first_response_at f FROM leads WHERE id = ?', r.json.lead.id).f);
});

test('AI draft never contains discount language (filter)', async () => {
  const ai = require('../../server/services/ai');
  assert.equal(ai.stripDiscountLanguage('Nice to meet you. Get 10% off today! We will call you.'), 'Nice to meet you. We will call you.');
  assert.ok(!ai.containsDiscountLanguage(ai.draftReply({ name: 'Ravi Kumar', message: 'any discount?', model_id: 1, status: 'new' }, 'en')));
  assert.ok(!ai.containsDiscountLanguage(ai.draftReply({ name: 'Ravi Kumar', model_id: 1, status: 'new' }, 'hi')));
  assert.equal(ai.containsDiscountLanguage('Please share your preferred time'), false);
});

test('opt-out blocks messaging and marks leads', async () => {
  const phone = '9733333333';
  const r = await t.api('POST', '/api/leads', lead({ phone, showroomId: ids.sr.alambagh }));
  assert.equal((await t.api('POST', '/api/opt-out', { phone })).json.updated, 1);
  assert.equal(t.db.q.get('SELECT opted_out o FROM leads WHERE id = ?', r.json.lead.id).o, 1);
  const r2 = await t.api('POST', '/api/leads', lead({ phone, showroomId: ids.sr.alambagh }));
  const m = t.db.q.all('SELECT status FROM messages WHERE lead_id = ?', r2.json.lead.id);
  assert.ok(m.length && m.every(x => x.status === 'blocked_optout'));
  const amit = await t.login('amit@companya.in', 'Sales@123');
  const x = await t.api('POST', `/api/staff/leads/${r2.json.lead.id}/reply`, { text: 'Hello there friend', confirmed_edit: true }, { cookie: amit });
  assert.equal(x.json.blocked, true);
});
