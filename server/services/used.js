'use strict';
const { q } = require('../lib/db');
const { parseJson, maskReg, slugify, toInt, toNum } = require('../lib/util');
const { emi, emiDefaults } = require('./catalog');

function emiFrom(price) {
  const d = emiDefaults();
  const down = Math.round(price * d.down_pct / 100);
  return emi({ principal: price, rate: d.rate, months: d.months, downPayment: down }).emi;
}

const fs = require('node:fs');
const path = require('node:path');
const USED_DIR = path.join(__dirname, '..', '..', 'public', 'img', 'used');
const FALLBACK = { 'model h': ['uc-1192', 'uc-1193'], 'model c': ['uc-1182', 'uc-1191', 'uc-1202'], 'model s': ['uc-1190', 'uc-1194', 'uc-1200'], 'model v': ['uc-1195', 'uc-1197', 'uc-1198'] };
const isSvg = u => /\.svg(\?|$)/i.test(String(u));
/** Real photo URL for a used car: its own /img/used/<stock>.jpg if present, else a same-body-type photo. Never an SVG. */
function photoFor(stockId, model) {
  const own = String(stockId || '').toLowerCase();
  if (own && fs.existsSync(path.join(USED_DIR, own + '.jpg'))) return `/img/used/${own}.jpg`;
  const list = (FALLBACK[String(model || '').toLowerCase()] || Object.values(FALLBACK).flat()).filter(f => fs.existsSync(path.join(USED_DIR, f + '.jpg')));
  const n = parseInt(own.replace(/\D/g, ''), 10) || 0;
  return list.length ? `/img/used/${list[n % list.length]}.jpg` : null;
}
function photosOf(r) {
  const own = parseJson(r.photos, []).filter(u => !isSvg(u));
  if (own.length) return own;
  const f = photoFor(r.stock_id, r.model);
  return f ? [f] : [];
}

function card(r) {
  const photos = photosOf(r);
  return {
    id: r.id, stock_id: r.stock_id, slug: r.slug, model: r.model, variant: r.variant, title: `${r.year} ${r.model} ${r.variant}`,
    year: r.year, km: r.km, owners: r.owners, fuel: r.fuel, transmission: r.transmission, color: r.color, price: r.price, status: r.status,
    reg_masked: maskReg(r.reg_no), location: r.location, photo: photos[0] || null,
    inspection_score: (parseJson(r.inspection, {}) || {}).score ?? null, emi_from: emiFrom(r.price),
  };
}

function listUsed(f = {}, opts = {}) {
  const where = [], p = [];
  const allowed = opts.staff ? ['available', 'booked', 'sold'] : ['available', 'booked'];
  const status = f.status && allowed.includes(f.status) ? f.status : null;
  if (status) { where.push('status = ?'); p.push(status); } else where.push("status IN ('available','booked')");
  if (f.model) { where.push("(lower(model) = lower(?) OR replace(lower(model),' ','-') = lower(?))"); p.push(String(f.model), String(f.model)); }
  if (f.fuel) { where.push('lower(fuel) = lower(?)'); p.push(String(f.fuel)); }
  if (f.transmission) { where.push('lower(transmission) = lower(?)'); p.push(String(f.transmission)); }
  if (toNum(f.minPrice) !== null) { where.push('price >= ?'); p.push(toNum(f.minPrice)); }
  if (toNum(f.maxPrice) !== null) { where.push('price <= ?'); p.push(toNum(f.maxPrice)); }
  if (toNum(f.minYear) !== null) { where.push('year >= ?'); p.push(toNum(f.minYear)); }
  if (toNum(f.maxYear) !== null) { where.push('year <= ?'); p.push(toNum(f.maxYear)); }
  if (toNum(f.maxKm) !== null) { where.push('km <= ?'); p.push(toNum(f.maxKm)); }
  if (toNum(f.owners) !== null) { where.push('owners <= ?'); p.push(toNum(f.owners)); }
  const order = { price_asc: 'price ASC', price_desc: 'price DESC', year_desc: 'year DESC, km ASC', km_asc: 'km ASC', newest: 'id DESC' }[f.sort] || "CASE status WHEN 'available' THEN 0 ELSE 1 END, id DESC";
  const pageSize = Math.min(60, Math.max(1, toInt(f.pageSize, 12)));
  const page = Math.max(1, toInt(f.page, 1));
  const w = where.join(' AND ');
  const total = q.get(`SELECT COUNT(*) c FROM used_cars WHERE ${w}`, ...p).c;
  const items = q.all(`SELECT * FROM used_cars WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, pageSize, (page - 1) * pageSize).map(card);
  const vis = "status IN ('available','booked')";
  const agg = q.get(`SELECT MIN(year) y0, MAX(year) y1, MIN(price) p0, MAX(price) p1 FROM used_cars WHERE ${vis}`);
  return {
    items, total, page, pageSize,
    facets: {
      models: q.all(`SELECT DISTINCT model FROM used_cars WHERE ${vis} ORDER BY model`).map(r => r.model),
      fuels: q.all(`SELECT DISTINCT fuel FROM used_cars WHERE ${vis} ORDER BY fuel`).map(r => r.fuel),
      years: [agg.y0, agg.y1], price: [agg.p0, agg.p1],
    },
  };
}

function getUsed(key) {
  const k = String(key || '');
  const r = q.get('SELECT * FROM used_cars WHERE slug = ? OR lower(stock_id) = lower(?) OR id = ?', k.toLowerCase(), k, /^\d+$/.test(k) ? Number(k) : -1);
  if (!r) return null;
  // NOTE: reg_no is intentionally never included here; only the masked form.
  return {
    id: r.id, stock_id: r.stock_id, slug: r.slug, model: r.model, variant: r.variant, title: `${r.year} ${r.model} ${r.variant}`,
    year: r.year, km: r.km, owners: r.owners, fuel: r.fuel, transmission: r.transmission, color: r.color, price: r.price, status: r.status,
    reg_masked: maskReg(r.reg_no), location: r.location, highlights: parseJson(r.highlights, []),
    inspection: parseJson(r.inspection, { score: 0, sections: [] }), photos: photosOf(r),
    emi_from: emiFrom(r.price), warranty_en: r.warranty_en, warranty_hi: r.warranty_hi, updated_at: r.updated_at,
  };
}

function makeSlug(stockId, model, variant, year) { return slugify(`${stockId}-${model}-${variant}-${year}`); }

module.exports = { listUsed, getUsed, makeSlug, card, photoFor };
