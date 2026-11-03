'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, futureDate } = require('./_helper');
let t, adv, adv2, wm, desk, principal, mgr;
before(async () => {
  t = await start();
  adv = await t.login('service@companya.in', 'Service@123'); adv2 = await t.login('service2@companya.in', 'Service@123');
  wm = await t.login('wm.amausi@companya.in', 'Workshop@123'); desk = await t.login('desk@companya.in', 'Desk@123');
  principal = await t.login('principal@companya.in', 'Principal@123'); mgr = await t.login('manager.alambagh@companya.in', 'Manager@123');
});
after(() => t.close());

test('job-card workflow with timestamps; invalid and terminal transitions rejected', async () => {
  const w = t.db.q.get("SELECT id FROM workshops WHERE slug = 'amausi'");
  const b = (await t.api('POST', '/api/service', { name: 'Job Card', phone: '9704000001', consent: true, regNo: 'UP32JC1111', workshopId: w.id, date: futureDate(12), time: '12:00', serviceType: 'repair' })).json.booking;
  for (const st of ['checked_in', 'in_progress', 'ready', 'delivered']) {
    const r = await t.api('PATCH', `/api/staff/bookings/${b.id}`, { status: st }, { cookie: adv });
    assert.equal(r.status, 200, st);
    assert.ok(r.json[st + '_at'], st + ' timestamp');
  }
  assert.equal((await t.api('PATCH', `/api/staff/bookings/${b.id}`, { status: 'booked' }, { cookie: adv })).status, 422);
  assert.equal((await t.api('PATCH', `/api/staff/bookings/${b.id}`, { status: 'weird' }, { cookie: adv })).status, 422);
  const mine = (await t.api('GET', '/api/customer/bookings', undefined, { cookie: await t.customer('9704000001') })).json.find(x => x.id === b.id);
  assert.ok(mine.job_card.delivered_at && mine.status === 'delivered');
  // test drives have no 'ready' state
  const sr = t.db.q.get("SELECT id FROM showrooms WHERE slug = 'gomti-nagar'").id;
  const tdid = Number(t.db.q.run("INSERT INTO bookings(type,name,phone,showroom_id,model_id,date,time,status,created_at,updated_at) VALUES ('test_drive','TD','9704000009',?,1,'2030-01-01','10:00','booked','x','x')", sr).lastInsertRowid);
  assert.equal((await t.api('PATCH', `/api/staff/bookings/${tdid}`, { status: 'ready' }, { cookie: await t.login('priya@companya.in', 'Sales@123') })).status, 422);
});

test('service call-back: public request, consent, 15-minute SLA, assignment, scoped queue', async () => {
  const body = { name: 'Call Me', phone: '9704000002', reason: 'AC not cooling', preferred_time: 'evening', consent: true };
  assert.equal((await t.api('POST', '/api/service/callback', { ...body, consent: false })).status, 422);
  assert.equal((await t.api('POST', '/api/service/callback', { ...body, phone: '123' })).status, 422);
  const r = await t.api('POST', '/api/service/callback', body);
  assert.equal(r.status, 201);
  const row = t.db.q.get('SELECT * FROM service_callbacks WHERE id = ?', r.json.callback.id);
  assert.equal(Date.parse(row.due_at) - Date.parse(row.created_at), 15 * 60000);
  assert.ok(row.assigned_to);
  assert.ok(t.db.q.get("SELECT 1 x FROM consents WHERE phone = '9704000002' AND purpose = 'service_callback'"));
  // admin-assigned advisor sees it; principal sees all; consultant cannot
  const q1 = (await t.api('GET', '/api/staff/callbacks', undefined, { cookie: desk })).status;
  assert.equal(q1, 403);
  assert.ok((await t.api('GET', '/api/staff/callbacks', undefined, { cookie: principal })).json.some(c => c.id === row.id));
  // put it in Amausi and respond
  t.db.q.run('UPDATE service_callbacks SET workshop_id = 1 WHERE id = ?', row.id);
  const list = (await t.api('GET', '/api/staff/callbacks', undefined, { cookie: adv })).json;
  const mine = list.find(c => c.id === row.id);
  assert.ok(mine && mine.sla.responded === false && mine.sla.remaining_sec > 600);
  const upd = await t.api('PATCH', `/api/staff/callbacks/${row.id}`, { status: 'contacted', notes: 'called' }, { cookie: adv });
  assert.equal(upd.status, 200); assert.ok(upd.json.first_response_at); assert.equal(upd.json.sla.breached, false);
  // advisor of another workshop cannot touch it; assigning outside the workshop is refused
  t.db.q.run('UPDATE service_callbacks SET assigned_to = NULL WHERE id = ?', row.id);
  assert.equal((await t.api('PATCH', `/api/staff/callbacks/${row.id}`, { status: 'closed' }, { cookie: adv2 })).status, 403);
  const adv2id = t.db.q.get("SELECT id FROM users WHERE email = 'service2@companya.in'").id;
  assert.equal((await t.api('PATCH', `/api/staff/callbacks/${row.id}`, { assigned_to: adv2id }, { cookie: wm })).status, 403);
  // breach
  const r2 = await t.api('POST', '/api/service/callback', { ...body, phone: '9704000003' });
  t.db.q.run('UPDATE service_callbacks SET created_at = ?, due_at = ?, workshop_id = 1 WHERE id = ?', new Date(Date.now() - 1800000).toISOString(), new Date(Date.now() - 900000).toISOString(), r2.json.callback.id);
  const br = (await t.api('GET', '/api/staff/callbacks?breached=1', undefined, { cookie: wm })).json;
  assert.ok(br.some(c => c.id === r2.json.callback.id && c.sla.breached));
});

test('lead-desk SLA monitor: unassigned, breached, near-breach, consultant load, scoped for managers', async () => {
  const sr = (await t.api('GET', '/api/showrooms')).json.find(s => s.slug === 'alambagh');
  const mk = async i => (await t.api('POST', '/api/leads', { name: 'Monitor ' + i, phone: '9705000' + String(100 + i), consent: true, showroomId: sr.id })).json.lead.id;
  const [un, late, near] = [await mk(1), await mk(2), await mk(3)];
  t.db.q.run('UPDATE leads SET assigned_to = NULL WHERE id = ?', un);
  t.db.q.run('UPDATE leads SET created_at = ?, due_at = ? WHERE id = ?', new Date(Date.now() - 900000).toISOString(), new Date(Date.now() - 600000).toISOString(), late);
  t.db.q.run('UPDATE leads SET due_at = ? WHERE id = ?', new Date(Date.now() + 60000).toISOString(), near);
  const m = (await t.api('GET', '/api/staff/sla', undefined, { cookie: desk })).json;
  assert.ok(m.unassigned.some(l => l.id === un)); assert.ok(m.breached.some(l => l.id === late)); assert.ok(m.near_breach.some(l => l.id === near));
  assert.ok(m.per_consultant.length >= 2 && m.counts.open > 10);
  const mm = (await t.api('GET', '/api/staff/sla', undefined, { cookie: mgr })).json;
  assert.ok(mm.counts.open < m.counts.open);
  assert.ok([...mm.unassigned, ...mm.breached, ...mm.near_breach].every(l => l.showroom_name.includes('Alambagh')));
  assert.equal((await t.api('GET', '/api/staff/sla', undefined, { cookie: await t.login('priya@companya.in', 'Sales@123') })).status, 403);
});

test('exec summary: SLA, sources, showrooms, funnel, used ageing, revenue-at-risk formula; trend days', async () => {
  const s = (await t.api('GET', '/api/exec/summary?days=60', undefined, { cookie: principal })).json;
  for (const k of ['sla', 'leads_by_source', 'leads_by_showroom', 'funnel', 'test_drives', 'service_utilisation', 'used_stock_ageing', 'revenue_at_risk', 'callbacks'])
    assert.ok(s[k] !== undefined, k);
  assert.deepEqual(s.funnel.map(f => f.stage), ['new', 'contacted', 'test_drive', 'negotiation', 'won']);
  assert.ok(s.funnel[0].count >= s.funnel[4].count);
  const r = s.revenue_at_risk;
  assert.equal(r.leads.amount, Math.round(r.leads.late_leads * r.leads.conversion_gap * 25000));
  assert.equal(r.callbacks.amount, Math.round(r.callbacks.unanswered * 0.5 * 4500 * 0.3));
  assert.equal(r.total, r.leads.amount + r.callbacks.amount);
  assert.ok(r.callbacks.unanswered >= 1);
  const tr = (await t.api('GET', '/api/exec/trend?days=30', undefined, { cookie: principal })).json;
  assert.equal(tr.series.length, 30); assert.ok(tr.series.some(d => d.leads > 0));
  assert.equal((await t.api('GET', '/api/exec/trend?days=7', undefined, { cookie: principal })).json.series.length, 7);
  assert.equal((await t.api('GET', '/api/exec/summary', undefined, { cookie: desk })).status, 403);
});
