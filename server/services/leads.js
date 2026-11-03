'use strict';
const { q, tx } = require('../lib/db');
const { httpError, normPhone, validEmail, clean, nowIso, sha, parseJson, toInt, truthy } = require('../lib/util');
const { parseCsv } = require('../lib/csv');
const messaging = require('./messaging');
const ai = require('./ai');
const { can } = require('../lib/perms');

const STATUSES = ['new', 'contacted', 'test_drive', 'negotiation', 'won', 'lost'];
const SOURCES = ['website', 'test_drive', 'trade_in', 'finance', 'carwale', 'cardekho', 'portal', 'facebook', 'instagram', 'walk_in', 'used_enquiry', 'callback'];
const TYPES = ['enquiry', 'test_drive', 'trade_in', 'finance', 'used', 'callback'];
const SLA_MS = 5 * 60 * 1000;
const CONSENT_TEXT = {
  en: 'I agree to Company A Motors contacting me by call, SMS and WhatsApp about my enquiry, and to the processing of my personal data as described in the Privacy Notice.',
  hi: 'मैं सहमत हूं कि Company A Motors मेरी पूछताछ के बारे में कॉल, एसएमएस और व्हाट्सएप से मुझसे संपर्क करे और मेरे व्यक्तिगत डेटा का उपयोग गोपनीयता सूचना के अनुसार किया जाए।',
};

/** Pick assignee: eligible consultants at the showroom (model specialty if set), fewest open leads, then least recently assigned. */
function pickAssignee(showroomId, modelId) {
  const cons = q.all(`SELECT u.*, (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('won','lost')) AS open_n,
                      (SELECT MAX(l.created_at) FROM leads l WHERE l.assigned_to = u.id) AS last_at
                      FROM users u WHERE u.role = 'consultant' AND u.active = 1`);
  const specOk = u => { const s = parseJson(u.specialty_model_ids, []); return !s.length || !modelId || s.includes(modelId); };
  const rank = (a, b) => a.open_n - b.open_n || String(a.last_at || '').localeCompare(String(b.last_at || '')) || a.id - b.id;
  // Specialty is a preference: specialists/generalists at the showroom are preferred, but a clearly less-loaded
  // other consultant (more than 5 fewer open leads) wins.
  const at = cons.filter(u => u.showroom_id === showroomId);
  const pref = at.filter(specOk).sort(rank)[0];
  const other = at.filter(u => !specOk(u)).sort(rank)[0];
  if (pref && other) return other.open_n + 5 < pref.open_n ? other : pref;
  if (pref || other) return pref || other;
  const anyOk = cons.filter(specOk).sort(rank)[0];
  return anyOk || cons.sort(rank)[0] || null;
}

function resolveShowroom(showroomId, city) {
  if (showroomId) {
    const s = q.get('SELECT id FROM showrooms WHERE id = ? AND active = 1 AND kind = \'showroom\'', showroomId);
    if (!s) throw httpError(422, 'Unknown showroom', { showroomId: 'Unknown showroom' });
    return s.id;
  }
  if (city) {
    const c = q.get('SELECT default_showroom_id FROM cities WHERE lower(slug) = lower(?) OR lower(name_en) = lower(?)', String(city), String(city));
    if (c && c.default_showroom_id) return c.default_showroom_id;
  }
  const d = q.get('SELECT id FROM showrooms WHERE active = 1 AND kind = \'showroom\' ORDER BY is_default DESC, id LIMIT 1');
  return d ? d.id : null;
}

function addEvent(leadId, type, detail, userId = null) {
  q.run('INSERT INTO lead_events(lead_id,type,detail,user_id,created_at) VALUES (?,?,?,?,?)', leadId, type, detail, userId, nowIso());
}

function recordConsent(phone, leadId, lang, ip, purpose, text) {
  const r = q.run('INSERT INTO consents(phone,lead_id,text,ip_hash,lang,purpose,created_at) VALUES (?,?,?,?,?,?,?)',
    phone, leadId, text || CONSENT_TEXT[lang === 'hi' ? 'hi' : 'en'], ip ? sha(ip + 'consent') : null, lang, purpose, nowIso());
  return Number(r.lastInsertRowid);
}

/** Core insert (no transaction of its own; call inside tx). Validates, consents, assigns, logs. */
function insertLead(d, opts = {}) {
  const errors = {};
  const name = clean(d.name, 80);
  if (name.length < 2) errors.name = 'Name must be 2-80 characters';
  const phone = normPhone(d.phone);
  if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number';
  if (d.email && !validEmail(String(d.email))) errors.email = 'Enter a valid email';
  if (!opts.skipConsent && !truthy(d.consent)) errors.consent = 'Consent is required to contact you';
  const type = d.type && TYPES.includes(d.type) ? d.type : 'enquiry';
  let source = d.source || ({ test_drive: 'test_drive', trade_in: 'trade_in', finance: 'finance', used: 'used_enquiry', callback: 'callback' }[type] || 'website');
  if (!SOURCES.includes(source)) errors.source = 'Unknown source';
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);

  const lang = d.lang === 'hi' ? 'hi' : 'en';
  const modelId = toInt(d.modelId, 0) || null;
  if (modelId && !q.get('SELECT 1 x FROM models WHERE id = ?', modelId)) throw httpError(422, 'Unknown model', { modelId: 'Unknown model' });
  const variantId = toInt(d.variantId, 0) || null;
  const usedId = toInt(d.usedId, 0) || null;
  const showroomId = resolveShowroom(toInt(d.showroomId, 0) || null, d.city);
  const assignee = pickAssignee(showroomId, modelId);
  const created = opts.createdAt || nowIso();
  const due = new Date(Date.parse(created) + SLA_MS).toISOString();
  const ti = d.tradeIn && typeof d.tradeIn === 'object' ? JSON.stringify({
    make: clean(d.tradeIn.make, 40), model: clean(d.tradeIn.model, 60), year: toInt(d.tradeIn.year, 0) || null, km: toInt(d.tradeIn.km, 0) || null, expectedPrice: toInt(d.tradeIn.expectedPrice, 0) || null,
  }) : null;
  const r = q.run(`INSERT INTO leads(source,type,name,phone,email,city,showroom_id,model_id,variant_id,used_id,message,trade_in,budget,status,assigned_to,lang,created_at,due_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    source, type, name, phone, d.email ? clean(d.email, 120) : null, clean(d.city, 60) || null, showroomId, modelId, variantId, usedId,
    clean(d.message, 1000) || null, ti, clean(d.budget, 60) || null, 'new', assignee ? assignee.id : null, lang, created, due, created);
  const id = Number(r.lastInsertRowid);
  const consentId = recordConsent(phone, id, lang, opts.ip, 'lead:' + source, opts.consentText);
  q.run('UPDATE leads SET consent_id = ? WHERE id = ?', consentId, id);
  if (q.get('SELECT 1 x FROM optouts WHERE phone = ?', phone)) q.run('UPDATE leads SET opted_out = 1 WHERE id = ?', id);
  addEvent(id, 'created', `Lead created via ${source}`);
  if (assignee) addEvent(id, 'assigned', `Auto-assigned to ${assignee.name}`);
  return { id, assignee, lang, phone, name, modelId };
}

function afterCreate(res, consultantFallback = 'our consultant') {
  const modelName = res.modelId ? (q.get('SELECT name FROM models WHERE id = ?', res.modelId) || {}).name : '';
  messaging.sendTemplate({ leadId: res.id, phone: res.phone, template: 'ack_lead', lang: res.lang, vars: { name: res.name.split(' ')[0], consultant: res.assignee ? res.assignee.name : consultantFallback, model: modelName } });
}

function publicLead(id) {
  const l = q.get('SELECT id, source, type, status, created_at, due_at FROM leads WHERE id = ?', id);
  return l;
}

/** Public: create a lead (enquiry / trade-in / finance / callback). Requires consent:true. */
function createLead(data, opts = {}) {
  const res = tx(() => insertLead(data, opts));
  afterCreate(res);
  return { lead: publicLead(res.id), assignee: res.assignee ? { name: res.assignee.name, phone: res.assignee.phone } : null };
}

function optOut({ phone }) {
  const p = normPhone(phone);
  if (!p) throw httpError(422, 'Enter a valid 10-digit mobile number', { phone: 'Invalid phone' });
  return tx(() => {
    q.run('INSERT OR IGNORE INTO optouts(phone, created_at) VALUES (?,?)', p, nowIso());
    const r = q.run('UPDATE leads SET opted_out = 1 WHERE phone = ?', p);
    for (const l of q.all('SELECT id FROM leads WHERE phone = ?', p)) addEvent(l.id, 'opt_out', 'Customer opted out of messages');
    return { updated: Number(r.changes) };
  });
}

// ---------------------------------------------------------------- staff side
function sla(l) {
  const due = Date.parse(l.due_at);
  const responded = !!l.first_response_at;
  const breached = responded ? Date.parse(l.first_response_at) > due : Date.now() > due;
  return { due_at: l.due_at, responded, breached, remaining_sec: responded ? null : Math.round((due - Date.now()) / 1000),
    response_sec: responded ? Math.round((Date.parse(l.first_response_at) - Date.parse(l.created_at)) / 1000) : null };
}

const SELECT_LEAD = `SELECT l.*, m.name AS model_name, s.name_en AS showroom_name, u.name AS assignee_name FROM leads l
  LEFT JOIN models m ON m.id = l.model_id LEFT JOIN showrooms s ON s.id = l.showroom_id LEFT JOIN users u ON u.id = l.assigned_to`;

function shapeLead(l) {
  const { ai_summary, ai_draft, ...rest } = l;
  return { ...rest, opted_out: !!l.opted_out, trade_in: parseJson(l.trade_in, null), sla: sla(l) };
}

/** Data scoping driven by permissions: all > showroom > own (assigned + own showroom) > used-car leads. */
function visibility(user) {
  if (can(user, 'lead.read.all')) return { sql: '1=1', p: [] };
  if (can(user, 'lead.read.showroom')) return { sql: 'l.showroom_id = ?', p: [user.showroom_id || 0] };
  if (can(user, 'lead.read.own')) return { sql: '(l.showroom_id = ? OR l.assigned_to = ?)', p: [user.showroom_id || 0, user.id] };
  if (can(user, 'lead.read.used')) return { sql: "(l.used_id IS NOT NULL OR l.type IN ('used','trade_in'))", p: [] };
  throw httpError(403, 'Not permitted for your role');
}

function listLeads(user, f = {}) {
  const v = visibility(user);
  const where = [v.sql], p = [...v.p];
  if (f.status && STATUSES.includes(f.status)) { where.push('l.status = ?'); p.push(f.status); }
  if (f.mine && truthy(f.mine)) { where.push('l.assigned_to = ?'); p.push(user.id); }
  if (f.showroom) { where.push('l.showroom_id = ?'); p.push(toInt(f.showroom)); }
  if (f.source) { where.push('l.source = ?'); p.push(String(f.source)); }
  if (f.q) { where.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)'); const x = `%${String(f.q).slice(0, 60)}%`; p.push(x, x, x); }
  if (f.breached && truthy(f.breached)) {
    where.push('((l.first_response_at IS NOT NULL AND l.first_response_at > l.due_at) OR (l.first_response_at IS NULL AND l.due_at < ?))'); p.push(nowIso());
  }
  const pageSize = Math.min(100, Math.max(1, toInt(f.pageSize, 25)));
  const page = Math.max(1, toInt(f.page, 1));
  const w = where.join(' AND ');
  const total = q.get(`SELECT COUNT(*) c FROM leads l WHERE ${w}`, ...p).c;
  const items = q.all(`${SELECT_LEAD} WHERE ${w} ORDER BY CASE WHEN l.status='new' THEN 0 ELSE 1 END, l.created_at DESC LIMIT ? OFFSET ?`, ...p, pageSize, (page - 1) * pageSize).map(shapeLead);
  return { items, total, page, pageSize };
}

function loadVisible(user, id) {
  const l = q.get(`${SELECT_LEAD} WHERE l.id = ?`, toInt(id));
  if (!l) throw httpError(404, 'Lead not found');
  const v = visibility(user);
  const ok = q.get(`SELECT 1 x FROM leads l WHERE l.id = ? AND ${v.sql}`, l.id, ...v.p);
  if (!ok) throw httpError(403, 'You cannot access this lead');
  return l;
}

function getLead(user, id) {
  const l = loadVisible(user, id);
  let summary = parseJson(l.ai_summary, null);
  let draft = l.ai_draft;
  if (!summary) { summary = ai.summarizeLead({ ...l, trade_in: l.trade_in }); q.run('UPDATE leads SET ai_summary = ? WHERE id = ?', JSON.stringify(summary), l.id); }
  if (!draft) { draft = ai.draftReply(l, l.lang); q.run('UPDATE leads SET ai_draft = ? WHERE id = ?', draft, l.id); }
  return {
    lead: shapeLead(l),
    events: q.all('SELECT e.*, u.name AS user_name FROM lead_events e LEFT JOIN users u ON u.id = e.user_id WHERE lead_id = ? ORDER BY e.id', l.id),
    messages: q.all('SELECT id, channel, template, body, direction, status, created_at FROM messages WHERE lead_id = ? ORDER BY id', l.id),
    ai: { summary, draft, notice: 'AI-generated - review before use' },
  };
}

async function regenerateAi(user, id) {
  const l = loadVisible(user, id);
  const summary = await ai.summarizeLeadAsync(l);
  const draft = await ai.draftReplyAsync(l, l.lang);
  q.run('UPDATE leads SET ai_summary = ?, ai_draft = ? WHERE id = ?', JSON.stringify(summary), draft, l.id);
  return { summary, draft, notice: 'AI-generated - review before use' };
}

function markResponded(l, userId) {
  if (!l.first_response_at) q.run('UPDATE leads SET first_response_at = ? WHERE id = ?', nowIso(), l.id);
}

function updateLead(user, id, body) {
  return tx(() => {
    const l = loadVisible(user, id);
    const sets = [], p = [];
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw httpError(422, 'Invalid status', { status: 'Invalid status' });
      if (body.status !== l.status) {
        sets.push('status = ?'); p.push(body.status);
        addEvent(l.id, 'status', `${l.status} -> ${body.status}`, user.id);
        if (l.status === 'new') markResponded(l, user.id);
      }
    }
    if (body.notes !== undefined) { sets.push('notes = ?'); p.push(clean(body.notes, 2000)); addEvent(l.id, 'note', 'Notes updated', user.id); }
    if (sets.length) q.run(`UPDATE leads SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...p, nowIso(), l.id);
    return shapeLead(q.get(`${SELECT_LEAD} WHERE l.id = ?`, l.id));
  });
}

function reassign(user, id, body) {
  return tx(() => {
    const l = loadVisible(user, id);
    const target = q.get("SELECT id, name, showroom_id FROM users WHERE id = ? AND active = 1 AND role IN ('consultant','showroom_manager','admin','used_manager')", toInt(body.user_id));
    if (!target) throw httpError(422, 'Choose an active staff member', { user_id: 'Invalid user' });
    if (!can(user, 'lead.read.all') && target.showroom_id !== user.showroom_id) throw httpError(403, 'You can reassign only within your own showroom');
    q.run('UPDATE leads SET assigned_to = ?, updated_at = ? WHERE id = ?', target.id, nowIso(), l.id);
    addEvent(l.id, 'reassigned', `Reassigned to ${target.name}${body.reason ? ': ' + clean(body.reason, 200) : ''}`, user.id);
    return shapeLead(q.get(`${SELECT_LEAD} WHERE l.id = ?`, l.id));
  });
}

function reply(user, id, body) {
  const l = loadVisible(user, id);
  const text = clean(body.text, 1000);
  if (!text) throw httpError(422, 'Message text required', { text: 'Required' });
  if (!truthy(body.confirmed_edit)) throw httpError(422, 'Please review and confirm the message before sending (confirmed_edit)', { confirmed_edit: 'Confirm required' });
  if (ai.containsDiscountLanguage(text)) throw httpError(422, 'Message contains discount/offer/price language, which cannot be sent from the inbox. Remove it and confirm the quotation separately.', { text: 'Discount or price language is not allowed' });
  const channel = ['whatsapp', 'sms'].includes(body.channel) ? body.channel : 'whatsapp';
  return tx(() => {
    const m = messaging.sendText({ leadId: l.id, phone: l.phone, text, channel, userId: user.id });
    if (m.status === 'blocked_optout') { addEvent(l.id, 'message_blocked', 'Customer has opted out', user.id); return { message: m, blocked: true }; }
    addEvent(l.id, 'reply', `${channel} reply sent`, user.id);
    markResponded(l, user.id);
    return { message: m, blocked: false };
  });
}

function stats(user) {
  const v = visibility(user);
  const rows = q.all(`SELECT l.* FROM leads l WHERE ${v.sql}`, ...v.p);
  const byStatus = Object.fromEntries(STATUSES.map(s => [s, 0]));
  let responded = 0, within = 0, breached = 0, sumMin = 0;
  const per = new Map();
  for (const l of rows) {
    byStatus[l.status]++;
    const s = sla(l);
    if (s.responded) { responded++; sumMin += s.response_sec / 60; if (!s.breached) within++; }
    if (s.breached) breached++;
    const k = l.assigned_to || 0;
    const c = per.get(k) || { user_id: k, total: 0, open: 0, responded: 0, within_sla: 0, breached: 0, sum: 0 };
    c.total++; if (!['won', 'lost'].includes(l.status)) c.open++;
    if (s.responded) { c.responded++; c.sum += s.response_sec / 60; if (!s.breached) c.within_sla++; }
    if (s.breached) c.breached++;
    per.set(k, c);
  }
  const names = Object.fromEntries(q.all('SELECT id, name FROM users').map(u => [u.id, u.name]));
  const r1 = x => Math.round(x * 10) / 10;
  return {
    total: rows.length, by_status: byStatus, responded,
    pct_within_5min: rows.length ? r1(within * 100 / Math.max(1, responded + rows.filter(l => !l.first_response_at && sla(l).breached).length)) : null,
    breached, avg_response_min: responded ? r1(sumMin / responded) : null,
    per_consultant: [...per.values()].map(c => ({ user_id: c.user_id || null, name: names[c.user_id] || 'Unassigned', total: c.total, open: c.open, breached: c.breached,
      pct_within_5min: c.responded ? r1(c.within_sla * 100 / c.responded) : null, avg_response_min: c.responded ? r1(c.sum / c.responded) : null })),
  };
}

function listConsultants(user) {
  const scoped = user && !can(user, 'lead.read.all');
  return q.all(`SELECT u.id, u.name, u.role, u.showroom_id, u.phone, s.name_en AS showroom_name,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status NOT IN ('won','lost')) AS open_leads
    FROM users u LEFT JOIN showrooms s ON s.id = u.showroom_id WHERE u.active = 1 AND u.role IN ('consultant','showroom_manager','used_manager','admin')
    ${scoped ? 'AND u.showroom_id = ?' : ''} ORDER BY u.name`, ...(scoped ? [user.showroom_id || 0] : []));
}

/** Live SLA monitor within the viewer's scope: unassigned, breached and near-breach open leads plus consultant load. */
function slaMonitor(user) {
  const v = visibility(user);
  const rows = q.all(`SELECT l.*, u.name AS assignee_name, s.name_en AS showroom_name, m.name AS model_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
    LEFT JOIN showrooms s ON s.id = l.showroom_id LEFT JOIN models m ON m.id = l.model_id WHERE ${v.sql} AND l.status NOT IN ('won','lost') ORDER BY l.created_at`, ...v.p);
  const item = l => ({ id: l.id, name: l.name, phone: l.phone, status: l.status, source: l.source, model_name: l.model_name, showroom_name: l.showroom_name,
    assignee_id: l.assigned_to, assignee_name: l.assignee_name, created_at: l.created_at, due_at: l.due_at, sla: sla(l) });
  const out = { unassigned: [], breached: [], near_breach: [], per_consultant: [], generated_at: nowIso() };
  for (const l of rows) {
    const s = sla(l);
    if (!l.assigned_to) out.unassigned.push(item(l));
    if (s.breached) out.breached.push(item(l));
    else if (!s.responded && s.remaining_sec <= 120) out.near_breach.push(item(l));
  }
  const load = new Map();
  for (const l of rows) {
    if (!l.assigned_to) continue;
    const c = load.get(l.assigned_to) || { user_id: l.assigned_to, name: l.assignee_name, open: 0, awaiting_response: 0, breached: 0 };
    c.open++; const s = sla(l); if (!s.responded) c.awaiting_response++; if (s.breached) c.breached++;
    load.set(l.assigned_to, c);
  }
  out.per_consultant = [...load.values()].sort((a, b) => b.open - a.open);
  out.counts = { unassigned: out.unassigned.length, breached: out.breached.length, near_breach: out.near_breach.length, open: rows.length };
  return out;
}

// ---------------------------------------------------------------- CSV import
const HEADER_MAP = {
  name: ['name', 'customername', 'fullname', 'customer', 'leadname', 'firstname', 'buyername'],
  phone: ['phone', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactnumber', 'phonenumber', 'contactno', 'mob', 'cell'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  model: ['model', 'car', 'carmodel', 'vehicle', 'interestedmodel', 'interestedin', 'product', 'variant'],
  city: ['city', 'location', 'town'],
  message: ['message', 'comments', 'comment', 'remarks', 'enquiry', 'enquirydetails', 'notes', 'query', 'requirement'],
  budget: ['budget', 'pricerange'],
};
function mapHeaders(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const k = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [field, alts] of Object.entries(HEADER_MAP)) if (map[field] === undefined && alts.includes(k)) { map[field] = i; break; }
  });
  return map;
}
function findModel(text, models) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  for (const m of models) if (t.includes(m.name.toLowerCase()) || t.includes(m.slug)) return m;
  const m = t.match(/\bmodel[\s-]*([a-z])\b/);
  return m ? models.find(x => x.slug === 'model-' + m[1]) || null : null;
}

function importCsv(user, { csv, source = 'portal', dryRun = true }, ip) {
  if (!csv || typeof csv !== 'string') throw httpError(400, 'csv text is required');
  if (!SOURCES.includes(source)) throw httpError(422, 'Unknown source', { source: 'Unknown source' });
  const rows = parseCsv(csv);
  if (rows.length < 2) throw httpError(422, 'CSV needs a header row and at least one data row');
  const map = mapHeaders(rows[0]);
  if (map.phone === undefined) throw httpError(422, 'Could not find a phone/mobile column', { header: 'Missing phone column. Found: ' + rows[0].join(', ') });
  const models = q.all('SELECT id, name, slug FROM models');
  const out = { created: 0, duplicates: 0, errors: [], preview: [], dryRun: !!dryRun, mapping: Object.fromEntries(Object.entries(map).map(([k, i]) => [k, rows[0][i]])) };
  const seen = new Set();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const get = (r, f) => (map[f] === undefined ? '' : String(r[map[f]] || '').trim());
  const doRows = () => {
    rows.slice(1).forEach((r, idx) => {
      const rowNo = idx + 2;
      const name = get(r, 'name'), phone = normPhone(get(r, 'phone'));
      const prev = { row: rowNo, name, phone: phone || get(r, 'phone'), model: get(r, 'model'), status: 'ok' };
      const fail = msg => { out.errors.push({ row: rowNo, message: msg }); prev.status = 'error'; prev.message = msg; if (out.preview.length < 50) out.preview.push(prev); };
      if (clean(name, 80).length < 2) return fail('Name missing or too short');
      if (!phone) return fail('Invalid phone number');
      const email = get(r, 'email');
      if (email && !validEmail(email)) return fail('Invalid email');
      const model = findModel(get(r, 'model') + ' ' + get(r, 'message'), models);
      const key = phone + '|' + (model ? model.id : 0);
      const dup = seen.has(key) || q.get('SELECT 1 x FROM leads WHERE phone = ? AND IFNULL(model_id,0) = ? AND created_at >= ?', phone, model ? model.id : 0, since);
      if (dup) { out.duplicates++; prev.status = 'duplicate'; if (out.preview.length < 50) out.preview.push(prev); return; }
      seen.add(key);
      if (!dryRun) {
        const res = insertLead({ source, type: 'enquiry', name, phone, email: email || null, city: get(r, 'city'), modelId: model ? model.id : null,
          message: [get(r, 'message'), model || !get(r, 'model') ? '' : 'Model asked: ' + get(r, 'model')].filter(Boolean).join(' | '), budget: get(r, 'budget'), consent: true, lang: 'en' },
          { ip, consentText: `Imported from portal "${source}" by ${user.email}; consent captured by the portal.` });
        out.created++;
        prev.lead_id = res.id; prev.assignee = res.assignee ? res.assignee.name : null;
        afterCreate(res);
      } else out.created++;
      if (out.preview.length < 50) out.preview.push(prev);
    });
  };
  if (dryRun) doRows(); else tx(doRows);
  return out;
}

module.exports = { createLead, insertLead, afterCreate, optOut, pickAssignee, listLeads, getLead, regenerateAi, updateLead, reassign, reply, stats, listConsultants, slaMonitor, importCsv, mapHeaders, sla, STATUSES, SOURCES, CONSENT_TEXT, addEvent, recordConsent };
