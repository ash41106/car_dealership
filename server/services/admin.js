'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { q, tx, dataDir } = require('../lib/db');
const { httpError, clean, slugify, nowIso, parseJson, toInt, toNum, truthy, isDate, today, addDays, normPhone, validEmail, validReg, normReg, randomId } = require('../lib/util');
const { hashPassword } = require('../lib/auth');
const { toCsv } = require('../lib/csv');
const { makeSlug } = require('./used');
const ai = require('./ai');

const ADMIN = ['admin'];
const USED = ['used_manager', 'admin'];

const ENTITIES = {
  models: { table: 'models', roles: ADMIN, req: ['name'], fields: { slug: 's', name: 's', tagline_en: 's', tagline_hi: 's', body_type: 's', description_en: 't', description_hi: 't', hero_image: 's', colors: 'j', gallery: 'j', specs: 'j', highlights: 'j', accessories_amount: 'i', featured: 'b', sort: 'i', active: 'b' }, enums: { body_type: ['hatchback', 'sedan', 'suv', 'mpv'] }, order: 'sort, id' },
  variants: { table: 'variants', roles: ADMIN, req: ['model_id', 'code', 'name', 'fuel', 'transmission', 'ex_showroom'], fields: { model_id: 'i', code: 's', name: 's', fuel: 's', transmission: 's', ex_showroom: 'i', features_en: 'j', features_hi: 'j', active: 'b' }, order: 'model_id, ex_showroom' },
  'price-rules': { table: 'price_rules', roles: ADMIN, req: ['city_id', 'road_tax_pct', 'road_tax_pct_high'], fields: { city_id: 'i', model_id: 'i', road_tax_pct: 'n', road_tax_pct_high: 'n', road_tax_threshold: 'i', registration_fee: 'i', insurance_pct: 'n', handling: 'i', fastag: 'i', tcs_pct: 'n', tcs_threshold: 'i', valid_until: 'd', active: 'b' }, order: 'city_id, model_id' },
  cities: { table: 'cities', roles: ADMIN, req: ['name_en'], fields: { slug: 's', name_en: 's', name_hi: 's', default_showroom_id: 'i', active: 'b', sort: 'i' }, order: 'sort, id' },
  offers: { table: 'offers', roles: ADMIN, req: ['title_en'], fields: { title_en: 's', title_hi: 's', body_en: 't', body_hi: 't', model_id: 'i', type: 's', amount: 'i', show_in_onroad: 'b', valid_until: 'd', banner_image: 's', active: 'b' }, enums: { type: ['cash', 'info'] }, order: 'id' },
  banners: { table: 'banners', roles: ADMIN, req: ['title_en'], fields: { title_en: 's', title_hi: 's', sub_en: 's', sub_hi: 's', image: 's', cta_label_en: 's', cta_label_hi: 's', cta_url: 's', sort: 'i', active: 'b' }, order: 'sort, id' },
  showrooms: { table: 'showrooms', roles: ADMIN, req: ['name_en'], fields: { slug: 's', kind: 's', name_en: 's', name_hi: 's', address_en: 's', address_hi: 's', phone: 's', lat: 'n', lng: 'n', hours: 's', is_default: 'b', active: 'b' }, enums: { kind: ['showroom', 'yard'] }, order: 'id' },
  workshops: { table: 'workshops', roles: ADMIN, req: ['name_en', 'bays'], fields: { slug: 's', name_en: 's', name_hi: 's', address_en: 's', address_hi: 's', phone: 's', lat: 'n', lng: 'n', hours: 's', bays: 'i', active: 'b' }, order: 'id' },
  'demo-cars': { table: 'demo_cars', roles: ADMIN, req: ['showroom_id', 'model_id'], fields: { showroom_id: 'i', model_id: 'i', variant_id: 'i', reg_no: 's', active: 'b' }, order: 'showroom_id, model_id' },
  users: { table: 'users', roles: ADMIN, req: ['name', 'email', 'role'], fields: { name: 's', email: 's', role: 's', phone: 's', showroom_id: 'i', specialty_model_ids: 'j', active: 'b' }, enums: { role: ['admin', 'used_manager', 'consultant', 'service_advisor'] }, order: 'id', hidden: ['password_hash'], audit: true },
  used: { table: 'used_cars', roles: USED, req: ['model', 'variant', 'year', 'km', 'fuel', 'transmission', 'price'], fields: { stock_id: 's', model: 's', variant: 's', year: 'i', km: 'i', owners: 'i', fuel: 's', transmission: 's', color: 's', price: 'i', status: 's', reg_no: 's', location: 's', highlights: 'j', inspection: 'j', photos: 'j', warranty_en: 's', warranty_hi: 's' }, enums: { status: ['available', 'booked', 'sold'] }, order: 'id DESC', audit: true },
  'past-sales': { table: 'past_sales', roles: USED, req: ['model', 'year', 'km', 'sold_price'], fields: { model: 's', variant: 's', year: 'i', km: 'i', fuel: 's', sold_price: 'i', sold_date: 'd' }, order: 'id DESC', audit: true },
};
const AUDITED = new Set(['price-rules', 'variants', 'offers', 'users', 'used', 'past-sales', 'models']);

function audit(user, action, entity, id, detail) {
  q.run('INSERT INTO audit_log(user_id,user_email,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
    user ? user.id : null, user ? user.email : null, action, entity, String(id ?? ''), detail ? JSON.stringify(detail).slice(0, 4000) : null, nowIso());
}

function coerce(cfg, body, existing) {
  const out = {}, errors = {};
  for (const [f, t] of Object.entries(cfg.fields)) {
    let v = body[f];
    if (v === undefined) continue;
    if (v === '' || v === null) { if (['i', 'n', 'd'].includes(t)) { out[f] = null; continue; } }
    switch (t) {
      case 's': out[f] = clean(v, 300); break;
      case 't': out[f] = clean(v, 5000); break;
      case 'i': { const n = toNum(v); if (n === null) errors[f] = 'Must be a number'; else out[f] = Math.round(n); break; }
      case 'n': { const n = toNum(v); if (n === null) errors[f] = 'Must be a number'; else out[f] = n; break; }
      case 'b': out[f] = truthy(v) ? 1 : 0; break;
      case 'd': if (!isDate(String(v))) errors[f] = 'Must be YYYY-MM-DD'; else out[f] = String(v); break;
      case 'j': {
        const j = typeof v === 'string' ? parseJson(v, undefined) : v;
        if (j === undefined || typeof j !== 'object') errors[f] = 'Must be valid JSON'; else out[f] = JSON.stringify(j).slice(0, 200000);
        break;
      }
    }
    if (cfg.enums && cfg.enums[f] && out[f] !== undefined && !cfg.enums[f].includes(out[f])) errors[f] = 'Must be one of: ' + cfg.enums[f].join(', ');
  }
  if (!existing) for (const r of cfg.req) if (out[r] === undefined || out[r] === null || out[r] === '') errors[r] = 'Required';
  return { out, errors };
}

function shapeRow(cfg, r) {
  const o = { ...r };
  for (const h of cfg.hidden || []) delete o[h];
  for (const [f, t] of Object.entries(cfg.fields)) if (t === 'j' && o[f] !== undefined) o[f] = parseJson(o[f], null);
  return o;
}

function hooks(name, out, existing, errors) {
  if (name === 'models') {
    if (!existing && !out.slug) out.slug = slugify(out.name);
    if (out.slug !== undefined) out.slug = slugify(out.slug);
    out.updated_at = nowIso();
  }
  if (name === 'cities' || name === 'showrooms' || name === 'workshops') {
    if (!existing && !out.slug) out.slug = slugify(out.name_en);
    else if (out.slug) out.slug = slugify(out.slug);
  }
  if (name === 'variants' && out.ex_showroom !== undefined && out.ex_showroom <= 0) errors.ex_showroom = 'Must be positive';
  if (name === 'price-rules') {
    for (const k of ['road_tax_pct', 'road_tax_pct_high', 'insurance_pct', 'tcs_pct']) if (out[k] !== undefined && (out[k] < 0 || out[k] > 50)) errors[k] = 'Must be between 0 and 50';
  }
  if (name === 'users') {
    if (out.email !== undefined) { if (!validEmail(out.email)) errors.email = 'Invalid email'; out.email = out.email.toLowerCase(); }
    if (out.phone) { const p = normPhone(out.phone); if (!p) errors.phone = 'Invalid phone'; else out.phone = p; }
    if (!existing) out.created_at = nowIso();
  }
  if (name === 'used') {
    if (out.reg_no) { if (!validReg(out.reg_no)) errors.reg_no = 'Invalid registration number'; else out.reg_no = normReg(out.reg_no); }
    if (out.price !== undefined && out.price <= 0) errors.price = 'Must be positive';
    const merged = { ...(existing || {}), ...out };
    if (!existing) {
      if (!out.stock_id) out.stock_id = 'UC-' + (1 + (q.get("SELECT MAX(CAST(SUBSTR(stock_id,4) AS INTEGER)) m FROM used_cars").m || 1200));
      out.stock_id = out.stock_id.toUpperCase();
      out.created_at = nowIso();
      if (!out.status) out.status = 'available';
    }
    const sid = out.stock_id || merged.stock_id;
    if (sid) out.slug = makeSlug(sid, merged.model, merged.variant, merged.year);
    if (out.inspection) {
      const ins = parseJson(out.inspection, {});
      if (ins && Array.isArray(ins.sections)) { ins.score = ins.sections.reduce((n, s) => n + (s.items || []).filter(i => i.status === 'ok').length, 0); out.inspection = JSON.stringify(ins); }
    }
    out.updated_at = nowIso();
    if (!existing && !out.photos) {
      const m = q.get('SELECT slug FROM models WHERE lower(name) = lower(?)', merged.model);
      out.photos = JSON.stringify([`/img/car/${m ? m.slug : 'model-h'}.svg?c=b3122d`]);
    }
  }
}

function dbErr(e) {
  const m = String(e && e.message);
  if (/UNIQUE/i.test(m)) return httpError(409, 'A record with that unique value already exists');
  if (/FOREIGN KEY/i.test(m)) return httpError(409, 'Related record missing, or this record is still referenced by others');
  if (/CHECK constraint/i.test(m)) return httpError(422, 'A value is out of the allowed range');
  return e;
}

function entity(name) {
  const cfg = ENTITIES[name];
  if (!cfg) throw httpError(404, 'Unknown entity');
  return cfg;
}
function allow(user, cfg) { if (!cfg.roles.includes(user.role)) throw httpError(403, 'Not permitted for your role'); }

function list(user, name) {
  const cfg = entity(name); allow(user, cfg);
  return q.all(`SELECT * FROM ${cfg.table} ORDER BY ${cfg.order}`).map(r => shapeRow(cfg, r));
}
function get(user, name, id) {
  const cfg = entity(name); allow(user, cfg);
  const r = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!r) throw httpError(404, 'Not found');
  const o = shapeRow(cfg, r);
  if (name === 'used') o.suggestion = ai.suggestUsedPrice(r);
  return o;
}
function create(user, name, body) {
  const cfg = entity(name); allow(user, cfg);
  const { out, errors } = coerce(cfg, body, null);
  if (name === 'users') {
    if (!body.password || String(body.password).length < 8) errors.password = 'Password must be at least 8 characters';
  }
  hooks(name, out, null, errors);
  if (Object.keys(errors).length) throw httpError(422, 'Validation failed', errors);
  if (name === 'users') out.password_hash = hashPassword(body.password);
  const cols = Object.keys(out);
  try {
    const r = q.run(`INSERT INTO ${cfg.table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(c => out[c]));
    const id = Number(r.lastInsertRowid);
    if (AUDITED.has(name)) audit(user, 'create', name, id, omit(out));
    return get(user, name, id);
  } catch (e) { throw dbErr(e); }
}
function omit(o) { const c = { ...o }; delete c.password_hash; return c; }
function update(user, name, id, body) {
  const cfg = entity(name); allow(user, cfg);
  const ex = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!ex) throw httpError(404, 'Not found');
  const { out, errors } = coerce(cfg, body, ex);
  hooks(name, out, ex, errors);
  if (name === 'users') {
    if (body.password) { if (String(body.password).length < 8) errors.password = 'Password must be at least 8 characters'; else out.password_hash = hashPassword(body.password); }
    if (ex.id === user.id && (out.active === 0 || (out.role && out.role !== 'admin'))) errors.role = 'You cannot demote or deactivate yourself';
  }
  if (Object.keys(errors).length) throw httpError(422, 'Validation failed', errors);
  const cols = Object.keys(out);
  if (!cols.length) return get(user, name, id);
  try {
    q.run(`UPDATE ${cfg.table} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...cols.map(c => out[c]), ex.id);
  } catch (e) { throw dbErr(e); }
  if (AUDITED.has(name)) {
    const diff = {};
    for (const c of cols) if (c !== 'updated_at' && c !== 'password_hash' && String(ex[c]) !== String(out[c])) diff[c] = { from: ex[c], to: out[c] };
    if (out.password_hash) diff.password = 'changed';
    audit(user, 'update', name, ex.id, diff);
  }
  return get(user, name, id);
}
function remove(user, name, id) {
  const cfg = entity(name); allow(user, cfg);
  const ex = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!ex) throw httpError(404, 'Not found');
  if (name === 'users' && ex.id === user.id) throw httpError(422, 'You cannot delete yourself');
  try { q.run(`DELETE FROM ${cfg.table} WHERE id = ?`, ex.id); } catch (e) { throw dbErr(e); }
  if (AUDITED.has(name)) audit(user, 'delete', name, ex.id, omit(ex));
  return { deleted: true };
}

function auditLog(limit = 200) {
  return q.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', Math.min(1000, toInt(limit, 200))).map(r => ({ ...r, detail: parseJson(r.detail, r.detail) }));
}

function getSettings() { return Object.fromEntries(q.all('SELECT key, value FROM settings').map(r => [r.key, r.value])); }
function putSettings(user, body) {
  const allowed = ['emi_rate', 'emi_months', 'emi_down_pct', 'td_slots', 'svc_slots'];
  tx(() => {
    for (const k of allowed) if (body[k] !== undefined) q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, clean(body[k], 200));
    audit(user, 'update', 'settings', '', body);
  });
  return getSettings();
}

// ---------------------------------------------------------------- upload
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
function saveUpload(user, { dataUrl, name }) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl || ''));
  if (!m) throw httpError(422, 'dataUrl must be a base64 PNG, JPEG, WebP or GIF image');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 3.8 * 1024 * 1024) throw httpError(413, 'Image too large (max ~3.8 MB)');
  const magic = buf.subarray(0, 4).toString('hex');
  const okMagic = { 'image/png': '89504e47', 'image/jpeg': 'ffd8ffe0|ffd8ffe1|ffd8ffdb|ffd8ffee|ffd8ffe2|ffd8ffe8', 'image/webp': '52494646', 'image/gif': '47494638' }[m[1]];
  if (!new RegExp('^(' + okMagic + ')$').test(magic)) throw httpError(422, 'File content does not match its type');
  const dir = path.join(dataDir(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const base = slugify(String(name || 'image').replace(/\.[a-z0-9]+$/i, '')).slice(0, 40) || 'image';
  const file = `${base}-${randomId(4)}.${EXT[m[1]]}`;
  fs.writeFileSync(path.join(dir, file), buf);
  audit(user, 'upload', 'upload', file, { bytes: buf.length });
  return { url: '/uploads/' + file };
}

// ---------------------------------------------------------------- DMS export / dashboard
function dmsCsv(date) {
  if (!isDate(date)) throw httpError(400, 'date must be YYYY-MM-DD');
  const next = addDays(date, 1);
  const rows = [];
  for (const l of q.all(`SELECT l.*, m.name mn, s.name_en sn, u.name un FROM leads l LEFT JOIN models m ON m.id=l.model_id LEFT JOIN showrooms s ON s.id=l.showroom_id
                         LEFT JOIN users u ON u.id=l.assigned_to WHERE l.status='won' AND substr(datetime(l.updated_at, '+5 hours', '+30 minutes'),1,10) = ?`, date)) {
    rows.push({ record_type: 'lead_won', id: l.id, date, customer_name: l.name, phone: l.phone, location: l.sn, model: l.mn, detail: l.source, status: 'won', owner: l.un, value: '' });
  }
  for (const b of q.all(`SELECT b.*, s.name_en sn, w.name_en wn, m.name mn FROM bookings b LEFT JOIN showrooms s ON s.id=b.showroom_id LEFT JOIN workshops w ON w.id=b.workshop_id
                         LEFT JOIN models m ON m.id=b.model_id WHERE b.date = ? ORDER BY b.time`, date)) {
    rows.push({ record_type: b.type === 'service' ? 'service_booking' : 'test_drive', id: b.id, date, customer_name: b.name, phone: b.phone, location: b.sn || b.wn, model: b.mn || b.model_name,
      detail: `${b.time}${b.service_type ? ' ' + b.service_type : ''}${b.reg_no ? ' ' + b.reg_no : ''}`, status: b.status, owner: '', value: '' });
  }
  for (const u of q.all("SELECT * FROM used_cars WHERE substr(updated_at,1,10) = ? AND status IN ('booked','sold')", date)) {
    rows.push({ record_type: 'used_status', id: u.stock_id, date, customer_name: '', phone: '', location: u.location, model: `${u.model} ${u.variant} ${u.year}`, detail: '', status: u.status, owner: '', value: u.price });
  }
  return toCsv(['record_type', 'id', 'date', 'customer_name', 'phone', 'location', 'model', 'detail', 'status', 'owner', 'value'], rows);
}

function dashboard() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const leadsPerDay = q.all('SELECT substr(created_at,1,10) d, COUNT(*) n FROM leads WHERE created_at >= ? GROUP BY d ORDER BY d', since);
  const leads = require('./leads');
  const st = leads.stats({ role: 'admin' });
  const util = q.all(`SELECT w.id, w.name_en, w.bays, (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.type='service' AND b.date = ? AND b.status NOT IN ('cancelled','no_show')) booked FROM workshops w WHERE w.active=1`, today());
  const slots = Math.max(1, (String(q.get("SELECT value FROM settings WHERE key='svc_slots'")?.value || '').split(',').length) || 7);
  return {
    sla: { pct_within_5min: st.pct_within_5min, breached: st.breached, avg_response_min: st.avg_response_min },
    leads_total: st.total, by_status: st.by_status, leads_per_day: leadsPerDay,
    test_drives_upcoming: q.get("SELECT COUNT(*) c FROM bookings WHERE type='test_drive' AND date >= ? AND status NOT IN ('cancelled','no_show')", today()).c,
    service_utilisation: util.map(w => ({ workshop: w.name_en, bays: w.bays, booked_today: w.booked, pct: Math.round(w.booked * 100 / (w.bays * slots)) })),
    used_stock: q.all('SELECT status, COUNT(*) n FROM used_cars GROUP BY status'),
  };
}

module.exports = { ENTITIES, list, get, create, update, remove, auditLog, saveUpload, dmsCsv, dashboard, audit, getSettings, putSettings };
