'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { q, tx, dataDir } = require('../lib/db');
const { httpError, clean, slugify, nowIso, parseJson, toInt, toNum, truthy, isDate, today, addDays, normPhone, validEmail, validReg, normReg, randomId } = require('../lib/util');
const auth = require('../lib/auth');
const { hashPassword } = auth;
const perms = require('../lib/perms');
const { can } = perms;
const { toCsv } = require('../lib/csv');
const { makeSlug } = require('./used');
const ai = require('./ai');


const ENTITIES = {
  models: { table: 'models', read: ['admin.read', 'content.models'], write: 'content.models', req: ['name'], fields: { slug: 's', name: 's', tagline_en: 's', tagline_hi: 's', body_type: 's', description_en: 't', description_hi: 't', hero_image: 's', colors: 'j', gallery: 'j', specs: 'j', highlights: 'j', accessories_amount: 'i', featured: 'b', sort: 'i', active: 'b' }, enums: { body_type: ['hatchback', 'sedan', 'suv', 'mpv'] }, order: 'sort, id' },
  variants: { table: 'variants', read: ['admin.read'], write: 'prices.write', req: ['model_id', 'code', 'name', 'fuel', 'transmission', 'ex_showroom'], fields: { model_id: 'i', code: 's', name: 's', fuel: 's', transmission: 's', ex_showroom: 'i', features_en: 'j', features_hi: 'j', active: 'b' }, order: 'model_id, ex_showroom' },
  'price-rules': { table: 'price_rules', read: ['admin.read'], write: 'prices.write', req: ['city_id', 'road_tax_pct', 'road_tax_pct_high'], fields: { city_id: 'i', model_id: 'i', road_tax_pct: 'n', road_tax_pct_high: 'n', road_tax_threshold: 'i', registration_fee: 'i', insurance_pct: 'n', handling: 'i', fastag: 'i', tcs_pct: 'n', tcs_threshold: 'i', valid_until: 'd', active: 'b' }, order: 'city_id, model_id' },
  cities: { table: 'cities', read: ['admin.read'], write: 'config.write', req: ['name_en'], fields: { slug: 's', name_en: 's', name_hi: 's', default_showroom_id: 'i', active: 'b', sort: 'i' }, order: 'sort, id' },
  offers: { table: 'offers', read: ['admin.read', 'content.offers'], write: 'content.offers', req: ['title_en'], fields: { title_en: 's', title_hi: 's', body_en: 't', body_hi: 't', model_id: 'i', type: 's', amount: 'i', show_in_onroad: 'b', valid_until: 'd', banner_image: 's', active: 'b' }, enums: { type: ['cash', 'info'] }, order: 'id' },
  banners: { table: 'banners', read: ['admin.read', 'content.banners'], write: 'content.banners', req: ['title_en'], fields: { title_en: 's', title_hi: 's', sub_en: 's', sub_hi: 's', image: 's', cta_label_en: 's', cta_label_hi: 's', cta_url: 's', sort: 'i', active: 'b' }, order: 'sort, id' },
  showrooms: { table: 'showrooms', read: ['admin.read'], write: 'config.write', req: ['name_en'], fields: { slug: 's', kind: 's', name_en: 's', name_hi: 's', address_en: 's', address_hi: 's', phone: 's', lat: 'n', lng: 'n', hours: 's', is_default: 'b', active: 'b' }, enums: { kind: ['showroom', 'yard'] }, order: 'id' },
  workshops: { table: 'workshops', read: ['admin.read'], write: 'config.write', req: ['name_en', 'bays'], fields: { slug: 's', name_en: 's', name_hi: 's', address_en: 's', address_hi: 's', phone: 's', lat: 'n', lng: 'n', hours: 's', bays: 'i', active: 'b' }, order: 'id' },
  'demo-cars': { table: 'demo_cars', read: ['admin.read'], write: 'config.write', req: ['showroom_id', 'model_id'], fields: { showroom_id: 'i', model_id: 'i', variant_id: 'i', reg_no: 's', active: 'b' }, order: 'showroom_id, model_id' },
  users: { table: 'users', read: ['users.read'], write: 'users.manage', req: ['name', 'email', 'role'], fields: { name: 's', email: 's', role: 's', phone: 's', showroom_id: 'i', workshop_id: 'i', specialty_model_ids: 'j', active: 'b' }, order: 'id', hidden: ['password_hash'], audit: true },
  used: { table: 'used_cars', read: ['used.read'], write: 'used.write', req: ['model', 'variant', 'year', 'km', 'fuel', 'transmission', 'price'], fields: { stock_id: 's', model: 's', variant: 's', year: 'i', km: 'i', owners: 'i', fuel: 's', transmission: 's', color: 's', price: 'i', status: 's', reg_no: 's', location: 's', highlights: 'j', inspection: 'j', photos: 'j', warranty_en: 's', warranty_hi: 's' }, enums: { status: ['available', 'booked', 'sold'] }, order: 'id DESC', audit: true },
  'past-sales': { table: 'past_sales', read: ['used.read'], write: 'used.write', req: ['model', 'year', 'km', 'sold_price'], fields: { model: 's', variant: 's', year: 'i', km: 'i', fuel: 's', sold_price: 'i', sold_date: 'd' }, order: 'id DESC', audit: true },
};
/** Price-bearing fields: changing them needs `prices.write` (content editors may edit copy/images only). Used-car price needs used.write (used_manager/admin). */
const PRICE_FIELDS = { models: ['accessories_amount', 'active'], offers: ['amount', 'type', 'show_in_onroad'], variants: ['ex_showroom'], 'price-rules': ['*'] };
/** Any change to these fields of a cash offer alters on-road prices (an offer is price-bearing when it is, or becomes, type 'cash'). */
const CASH_OFFER_FIELDS = ['active', 'model_id', 'valid_until', 'amount', 'type', 'show_in_onroad'];
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

function checkPriceFields(user, name, out, existing) {
  if (can(user, 'prices.write')) return;
  if (name === 'offers' && ((existing && existing.type === 'cash') || out.type === 'cash')) {
    for (const f of CASH_OFFER_FIELDS) {
      if (out[f] === undefined) continue;
      if (!existing || String(existing[f] ?? '') !== String(out[f] ?? '')) throw httpError(403, `Changing "${f}" of a cash offer requires the price permission`, { [f]: 'Requires prices.write' });
    }
  }
  const fields = PRICE_FIELDS[name];
  if (!fields) return;
  for (const f of fields === '*' ? Object.keys(out) : fields) {
    if (out[f] === undefined) continue;
    const same = existing ? String(existing[f] ?? '') === String(out[f] ?? '') : (out[f] === null || out[f] === 0 || out[f] === 'info' || out[f] === '');
    if (!same) throw httpError(403, `Changing "${f}" requires the price permission`, { [f]: 'Requires prices.write' });
  }
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
    if (out.role !== undefined && (out.role === 'customer' || !perms.roleNames().includes(out.role))) errors.role = 'Unknown role';
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
      out.photos = JSON.stringify([require('./used').photoFor(out.stock_id, merged.model)].filter(Boolean));
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
function allow(user, cfg, mode = 'read') { if (!can(user, mode === 'write' ? cfg.write : cfg.read)) throw httpError(403, 'Not permitted for your role'); }

function list(user, name) {
  const cfg = entity(name); allow(user, cfg, 'read');
  return q.all(`SELECT * FROM ${cfg.table} ORDER BY ${cfg.order}`).map(r => shapeRow(cfg, r));
}
function get(user, name, id) {
  const cfg = entity(name); allow(user, cfg, 'read');
  const r = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!r) throw httpError(404, 'Not found');
  const o = shapeRow(cfg, r);
  if (name === 'used' && can(user, 'used.price_suggestion')) o.suggestion = ai.suggestUsedPrice(r);
  return o;
}
function create(user, name, body) {
  const cfg = entity(name); allow(user, cfg, 'write');
  const { out, errors } = coerce(cfg, body, null);
  if (name === 'users') {
    try { auth.checkPolicy(body.password, { email: body.email, name: body.name }); } catch (e) { errors.password = e.message; }
  }
  checkPriceFields(user, name, out, null);
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
  const cfg = entity(name); allow(user, cfg, 'write');
  const ex = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!ex) throw httpError(404, 'Not found');
  const { out, errors } = coerce(cfg, body, ex);
  checkPriceFields(user, name, out, ex);
  hooks(name, out, ex, errors);
  if (name === 'users') {
    if (body.password) { try { auth.checkPolicy(body.password, { email: out.email || ex.email, name: out.name || ex.name }); out.password_hash = hashPassword(body.password); out.password_changed_at = nowIso(); } catch (e) { errors.password = e.message; } }
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
  if (name === 'users' && (out.active === 0 || out.password_hash || (out.role && out.role !== ex.role))) auth.revokeUserSessions(ex.id);
  return get(user, name, id);
}
function remove(user, name, id) {
  const cfg = entity(name); allow(user, cfg, 'write');
  const ex = q.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, toInt(id));
  if (!ex) throw httpError(404, 'Not found');
  if (name === 'users' && ex.id === user.id) throw httpError(422, 'You cannot delete yourself');
  if ((name === 'offers' && ex.type === 'cash') || name === 'models') { if (!can(user, 'prices.write')) throw httpError(403, 'Deleting this record requires the price permission'); }
  try { q.run(`DELETE FROM ${cfg.table} WHERE id = ?`, ex.id); } catch (e) { throw dbErr(e); }
  if (AUDITED.has(name)) audit(user, 'delete', name, ex.id, omit(ex));
  return { deleted: true };
}

function auditLog(user, limit = 200) {
  const rows = q.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', Math.min(1000, toInt(limit, 200))).map(r => ({ ...r, detail: parseJson(r.detail, r.detail) }));
  return can(user, 'audit.read') ? rows : rows.filter(r => ['used', 'past-sales'].includes(r.entity));
}

/** Admin: reset a user's password to a one-time temporary one (must be changed at next login). */
function resetPassword(user, id) {
  const u = q.get('SELECT * FROM users WHERE id = ?', toInt(id));
  if (!u) throw httpError(404, 'User not found');
  const temp = auth.tempPassword();
  q.run('UPDATE users SET password_hash = ?, must_change_password = 1, password_changed_at = ? WHERE id = ?', hashPassword(temp), nowIso(), u.id);
  auth.revokeUserSessions(u.id);
  audit(user, 'reset_password', 'users', u.id, { email: u.email });
  return { user_id: u.id, email: u.email, temp_password: temp, must_change_password: true, note: 'Shown once. The user must change it at next login.' };
}

function listRoles() {
  return { roles: perms.listRoles(), permissions: Object.entries(perms.PERMS).map(([perm, description]) => ({ perm, description })) };
}
function setRolePermissions(user, role, list) {
  if (!perms.roleNames().includes(role)) throw httpError(404, 'Unknown role');
  if (role === 'admin' || role === 'customer') throw httpError(422, `The ${role} role's permissions are fixed`);
  if (!Array.isArray(list) || list.some(p => !perms.PERMS[p] || p === 'customer.self')) throw httpError(422, 'permissions must be an array of known permission names', { permissions: 'Unknown permission' });
  const before = [...perms.permsOf(role)].sort();
  const after = [...new Set(list)].sort();
  tx(() => {
    perms.setRolePerms(role, after);
    audit(user, 'update_permissions', 'roles', role, { added: after.filter(p => !before.includes(p)), removed: before.filter(p => !after.includes(p)) });
  });
  return perms.listRoles().find(r => r.name === role);
}

const JSON_SETTINGS = ['site_stats', 'contact'];
function getSettings() {
  const o = Object.fromEntries(q.all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  for (const k of JSON_SETTINGS) o[k] = parseJson(o[k], {});
  return o;
}
/** Public, cacheable subset used by the website (marketing numbers and contact details; no secrets). */
function publicSettings() {
  const s = getSettings();
  return { site_stats: s.site_stats, contact: s.contact, emi: { rate: Number(s.emi_rate || 9.5), months: Number(s.emi_months || 60), down_pct: Number(s.emi_down_pct || 20) } };
}
function jsonSetting(k, v) {
  const o = typeof v === 'string' ? parseJson(v, undefined) : v;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw httpError(422, `${k} must be a JSON object`, { [k]: 'Invalid' });
  const out = {};
  for (const [key, val] of Object.entries(o)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(key)) throw httpError(422, `${k}: invalid key "${key}"`, { [k]: 'Invalid key' });
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
    else if (typeof val === 'string' && val.length <= 300) out[key] = clean(val, 300);
    else throw httpError(422, `${k}.${key} must be a number or short text`, { [k]: 'Invalid value' });
  }
  return JSON.stringify(out);
}
function putSettings(user, body) {
  const allowed = ['emi_rate', 'emi_months', 'emi_down_pct', 'td_slots', 'svc_slots'];
  const jsons = JSON_SETTINGS.filter(k => body[k] !== undefined).map(k => [k, jsonSetting(k, body[k])]);
  tx(() => {
    for (const [k, v] of jsons) q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);
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

module.exports = { publicSettings, ENTITIES, list, get, create, update, remove, auditLog, resetPassword, listRoles, setRolePermissions, saveUpload, dmsCsv, dashboard, audit, getSettings, putSettings };
