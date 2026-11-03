'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');
let db = null;
const stmts = new Map();
let depth = 0;

function dbPath() { return process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(ROOT, 'data', 'app.db'); }
function dataDir() { return path.dirname(dbPath()); }

const MIGRATIONS = [
  { v: 1, sql: `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE showrooms (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, kind TEXT NOT NULL DEFAULT 'showroom',
  name_en TEXT NOT NULL, name_hi TEXT, address_en TEXT, address_hi TEXT, phone TEXT, lat REAL, lng REAL,
  hours TEXT, is_default INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE workshops (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name_en TEXT NOT NULL, name_hi TEXT, address_en TEXT, address_hi TEXT,
  phone TEXT, lat REAL, lng REAL, hours TEXT, bays INTEGER NOT NULL DEFAULT 4, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE cities (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name_en TEXT NOT NULL, name_hi TEXT,
  default_showroom_id INTEGER REFERENCES showrooms(id) ON DELETE SET NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','used_manager','consultant','service_advisor')),
  phone TEXT, showroom_id INTEGER REFERENCES showrooms(id) ON DELETE SET NULL,
  specialty_model_ids TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE models (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, tagline_en TEXT, tagline_hi TEXT, body_type TEXT NOT NULL DEFAULT 'hatchback',
  description_en TEXT, description_hi TEXT, hero_image TEXT, colors TEXT NOT NULL DEFAULT '[]', gallery TEXT NOT NULL DEFAULT '[]',
  specs TEXT NOT NULL DEFAULT '[]', highlights TEXT NOT NULL DEFAULT '[]', accessories_amount INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE variants (
  id INTEGER PRIMARY KEY, model_id INTEGER NOT NULL REFERENCES models(id), code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  fuel TEXT NOT NULL, transmission TEXT NOT NULL, ex_showroom INTEGER NOT NULL CHECK (ex_showroom > 0),
  features_en TEXT NOT NULL DEFAULT '[]', features_hi TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX idx_variants_model ON variants(model_id);
CREATE TABLE price_rules (
  id INTEGER PRIMARY KEY, city_id INTEGER NOT NULL REFERENCES cities(id), model_id INTEGER REFERENCES models(id),
  road_tax_pct REAL NOT NULL, road_tax_pct_high REAL NOT NULL, road_tax_threshold INTEGER NOT NULL DEFAULT 1000000,
  registration_fee INTEGER NOT NULL DEFAULT 0, insurance_pct REAL NOT NULL DEFAULT 0, handling INTEGER NOT NULL DEFAULT 0,
  fastag INTEGER NOT NULL DEFAULT 0, tcs_pct REAL NOT NULL DEFAULT 1, tcs_threshold INTEGER NOT NULL DEFAULT 1000000,
  valid_until TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX idx_price_rules_city ON price_rules(city_id, model_id);
CREATE TABLE offers (
  id INTEGER PRIMARY KEY, title_en TEXT NOT NULL, title_hi TEXT, body_en TEXT, body_hi TEXT, model_id INTEGER REFERENCES models(id),
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('cash','info')), amount INTEGER NOT NULL DEFAULT 0,
  show_in_onroad INTEGER NOT NULL DEFAULT 0, valid_until TEXT, banner_image TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE banners (
  id INTEGER PRIMARY KEY, title_en TEXT NOT NULL, title_hi TEXT, sub_en TEXT, sub_hi TEXT, image TEXT, cta_label_en TEXT, cta_label_hi TEXT,
  cta_url TEXT, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE used_cars (
  id INTEGER PRIMARY KEY, stock_id TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL,
  year INTEGER NOT NULL, km INTEGER NOT NULL, owners INTEGER NOT NULL DEFAULT 1, fuel TEXT NOT NULL, transmission TEXT NOT NULL,
  color TEXT, price INTEGER NOT NULL CHECK (price > 0), status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','sold')),
  reg_no TEXT, location TEXT, highlights TEXT NOT NULL DEFAULT '[]', inspection TEXT NOT NULL DEFAULT '{}', photos TEXT NOT NULL DEFAULT '[]',
  warranty_en TEXT, warranty_hi TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_used_status ON used_cars(status, model, year);
CREATE TABLE past_sales (
  id INTEGER PRIMARY KEY, model TEXT NOT NULL, variant TEXT, year INTEGER NOT NULL, km INTEGER NOT NULL, fuel TEXT,
  sold_price INTEGER NOT NULL, sold_date TEXT);
CREATE INDEX idx_past_sales_model ON past_sales(model, year);
CREATE TABLE demo_cars (
  id INTEGER PRIMARY KEY, showroom_id INTEGER NOT NULL REFERENCES showrooms(id), model_id INTEGER NOT NULL REFERENCES models(id),
  variant_id INTEGER REFERENCES variants(id), reg_no TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX idx_demo_cars ON demo_cars(showroom_id, model_id);
CREATE TABLE consents (
  id INTEGER PRIMARY KEY, phone TEXT NOT NULL, lead_id INTEGER, text TEXT NOT NULL, ip_hash TEXT, lang TEXT, purpose TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_consents_phone ON consents(phone);
CREATE TABLE optouts (phone TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE leads (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'enquiry', name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  city TEXT, showroom_id INTEGER REFERENCES showrooms(id), model_id INTEGER REFERENCES models(id), variant_id INTEGER REFERENCES variants(id),
  used_id INTEGER REFERENCES used_cars(id), message TEXT, trade_in TEXT, budget TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','test_drive','negotiation','won','lost')),
  assigned_to INTEGER REFERENCES users(id), notes TEXT, consent_id INTEGER, lang TEXT NOT NULL DEFAULT 'en', opted_out INTEGER NOT NULL DEFAULT 0,
  ai_summary TEXT, ai_draft TEXT, created_at TEXT NOT NULL, due_at TEXT NOT NULL, first_response_at TEXT, updated_at TEXT NOT NULL);
CREATE INDEX idx_leads_status ON leads(status, created_at);
CREATE INDEX idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX idx_leads_phone ON leads(phone, model_id, created_at);
CREATE INDEX idx_leads_showroom ON leads(showroom_id);
CREATE TABLE lead_events (
  id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE, type TEXT NOT NULL, detail TEXT,
  user_id INTEGER, created_at TEXT NOT NULL);
CREATE INDEX idx_lead_events ON lead_events(lead_id, id);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY, lead_id INTEGER, phone TEXT NOT NULL, channel TEXT NOT NULL, template TEXT, lang TEXT, body TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out', status TEXT NOT NULL, provider_id TEXT, user_id INTEGER, created_at TEXT NOT NULL);
CREATE INDEX idx_messages_lead ON messages(lead_id);
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('test_drive','service')), lead_id INTEGER REFERENCES leads(id),
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, showroom_id INTEGER REFERENCES showrooms(id), workshop_id INTEGER REFERENCES workshops(id),
  model_id INTEGER REFERENCES models(id), variant_id INTEGER REFERENCES variants(id), demo_car_id INTEGER REFERENCES demo_cars(id),
  date TEXT NOT NULL, time TEXT NOT NULL, service_type TEXT, pickup_drop INTEGER NOT NULL DEFAULT 0, reg_no TEXT, model_name TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','confirmed','in_progress','completed','cancelled','no_show')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX uq_demo_slot ON bookings(demo_car_id, date, time) WHERE type='test_drive' AND status NOT IN ('cancelled','no_show');
CREATE INDEX idx_bookings_workshop ON bookings(workshop_id, date, time);
CREATE INDEX idx_bookings_date ON bookings(date, type);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, user_email TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, detail TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_audit ON audit_log(id DESC);
` },
  { v: 2, fkOff: true, sql: `
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL,
  phone TEXT, showroom_id INTEGER REFERENCES showrooms(id) ON DELETE SET NULL, workshop_id INTEGER REFERENCES workshops(id) ON DELETE SET NULL,
  specialty_model_ids TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT, last_login_at TEXT, created_at TEXT NOT NULL);
INSERT INTO users_new(id,name,email,password_hash,role,phone,showroom_id,specialty_model_ids,active,created_at)
  SELECT id,name,email,password_hash,role,phone,showroom_id,specialty_model_ids,active,created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE TABLE bookings_new (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('test_drive','service')), lead_id INTEGER REFERENCES leads(id), customer_id INTEGER,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, showroom_id INTEGER REFERENCES showrooms(id), workshop_id INTEGER REFERENCES workshops(id),
  model_id INTEGER REFERENCES models(id), variant_id INTEGER REFERENCES variants(id), demo_car_id INTEGER REFERENCES demo_cars(id),
  date TEXT NOT NULL, time TEXT NOT NULL, service_type TEXT, pickup_drop INTEGER NOT NULL DEFAULT 0, reg_no TEXT, model_name TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','confirmed','checked_in','in_progress','ready','delivered','completed','cancelled','no_show')),
  checked_in_at TEXT, in_progress_at TEXT, ready_at TEXT, delivered_at TEXT, cancelled_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO bookings_new(id,type,lead_id,name,phone,email,showroom_id,workshop_id,model_id,variant_id,demo_car_id,date,time,service_type,pickup_drop,reg_no,model_name,notes,status,created_at,updated_at)
  SELECT id,type,lead_id,name,phone,email,showroom_id,workshop_id,model_id,variant_id,demo_car_id,date,time,service_type,pickup_drop,reg_no,model_name,notes,status,created_at,updated_at FROM bookings;
DROP TABLE bookings;
ALTER TABLE bookings_new RENAME TO bookings;
CREATE UNIQUE INDEX uq_demo_slot ON bookings(demo_car_id, date, time) WHERE type='test_drive' AND status NOT IN ('cancelled','no_show');
CREATE INDEX idx_bookings_workshop ON bookings(workshop_id, date, time);
CREATE INDEX idx_bookings_date ON bookings(date, type);
CREATE INDEX idx_bookings_phone ON bookings(phone);
ALTER TABLE leads ADD COLUMN customer_id INTEGER;
CREATE TABLE roles (name TEXT PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE role_permissions (role TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE, perm TEXT NOT NULL, PRIMARY KEY (role, perm));
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('staff','customer')), user_id INTEGER, customer_id INTEGER, role TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT, ua TEXT, revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_customer ON sessions(customer_id);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT, email TEXT, lang TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL, last_login_at TEXT);
CREATE TABLE customer_otps (
  id INTEGER PRIMARY KEY, phone TEXT NOT NULL, otp_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX idx_otps_phone ON customer_otps(phone, id);
CREATE TABLE customer_vehicles (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, reg_no TEXT NOT NULL, model TEXT, year INTEGER, km INTEGER,
  last_service TEXT, created_at TEXT NOT NULL, UNIQUE (customer_id, reg_no));
CREATE TABLE saved_cars (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('new','used')), ref TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE (customer_id, kind, ref));
CREATE TABLE data_requests (
  id INTEGER PRIMARY KEY, customer_id INTEGER, phone TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, handled_by INTEGER, handled_at TEXT);
CREATE TABLE service_callbacks (
  id INTEGER PRIMARY KEY, customer_id INTEGER, name TEXT NOT NULL, phone TEXT NOT NULL, reason TEXT, preferred_time TEXT, workshop_id INTEGER REFERENCES workshops(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','scheduled','closed')), assigned_to INTEGER REFERENCES users(id), notes TEXT,
  created_at TEXT NOT NULL, due_at TEXT NOT NULL, first_response_at TEXT, updated_at TEXT NOT NULL);
CREATE INDEX idx_callbacks ON service_callbacks(status, created_at);
` },
];

function open(file) {
  if (db) return db;
  const p = file || dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  db = new DatabaseSync(p);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  migrate();
  return db;
}

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.v)) continue;
    if (m.fkOff) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(m.v, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; } finally { if (m.fkOff) db.exec('PRAGMA foreign_keys = ON'); }
  }
}

function close() { if (db) { stmts.clear(); try { db.close(); } catch {} db = null; } }
function conn() { if (!db) open(); return db; }

function bind(params) {
  return params.map(p => (p === undefined ? null : p === true ? 1 : p === false ? 0 : p));
}
function prep(sql) {
  let s = stmts.get(sql);
  if (!s) { s = conn().prepare(sql); stmts.set(sql, s); }
  return s;
}
const q = {
  all: (sql, ...p) => prep(sql).all(...bind(p)),
  get: (sql, ...p) => prep(sql).get(...bind(p)),
  run: (sql, ...p) => prep(sql).run(...bind(p)),
  exec: sql => conn().exec(sql),
};

/** Run fn inside an IMMEDIATE transaction (re-entrant: nested calls join the outer one). */
function tx(fn) {
  if (depth > 0) return fn();
  conn().exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    conn().exec('COMMIT');
    return r;
  } catch (e) {
    try { conn().exec('ROLLBACK'); } catch {}
    throw e;
  } finally { depth--; }
}

function getSetting(key, def) {
  const r = q.get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : def;
}
function setSetting(key, value) {
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
}

module.exports = { open, close, conn, q, tx, getSetting, setSetting, dbPath, dataDir, ROOT };
