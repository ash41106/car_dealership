'use strict';
const { q, getSetting } = require('../lib/db');
const { httpError, parseJson, today, toNum } = require('../lib/util');

function listCities() {
  return q.all('SELECT id, slug, name_en, name_hi FROM cities WHERE active = 1 ORDER BY sort, id');
}

function shapeModel(m) {
  const vs = q.all('SELECT fuel, ex_showroom FROM variants WHERE model_id = ? AND active = 1', m.id);
  return {
    id: m.id, slug: m.slug, name: m.name, tagline_en: m.tagline_en, tagline_hi: m.tagline_hi, body_type: m.body_type,
    fuel_types: [...new Set(vs.map(v => v.fuel))],
    from_price: vs.length ? Math.min(...vs.map(v => v.ex_showroom)) : null,
    hero_image: m.hero_image, colors: parseJson(m.colors, []), featured: !!m.featured,
  };
}

function listModels() {
  return q.all('SELECT * FROM models WHERE active = 1 ORDER BY sort, id').map(shapeModel);
}

function listOffers(opts = { active: true }) {
  const onlyActive = !opts || opts.active !== false;
  const rows = onlyActive
    ? q.all('SELECT * FROM offers WHERE active = 1 AND (valid_until IS NULL OR valid_until = \'\' OR valid_until >= ?) ORDER BY id', today())
    : q.all('SELECT * FROM offers ORDER BY id');
  return rows.map(o => ({
    id: o.id, title_en: o.title_en, title_hi: o.title_hi, body_en: o.body_en, body_hi: o.body_hi, model_id: o.model_id || null,
    valid_until: o.valid_until, banner_image: o.banner_image, type: o.type, amount: o.type === 'cash' ? o.amount : 0,
  }));
}

function getModel(slug) {
  const m = q.get('SELECT * FROM models WHERE (slug = ? OR id = ?) AND active = 1', String(slug), /^\d+$/.test(String(slug)) ? Number(slug) : -1);
  if (!m) return null;
  const out = shapeModel(m);
  out.description_en = m.description_en; out.description_hi = m.description_hi;
  out.gallery = parseJson(m.gallery, []);
  out.specs = parseJson(m.specs, []);
  out.highlights = parseJson(m.highlights, []);
  out.accessories_amount = m.accessories_amount;
  out.variants = q.all('SELECT * FROM variants WHERE model_id = ? AND active = 1 ORDER BY ex_showroom', m.id).map(v => ({
    id: v.id, code: v.code, name: v.name, fuel: v.fuel, transmission: v.transmission, ex_showroom: v.ex_showroom,
    features_en: parseJson(v.features_en, []), features_hi: parseJson(v.features_hi, []),
  }));
  out.offers = listOffers({ active: true }).filter(o => !o.model_id || o.model_id === m.id);
  return out;
}

function listBanners() {
  return q.all('SELECT id,title_en,title_hi,sub_en,sub_hi,image,cta_label_en,cta_label_hi,cta_url FROM banners WHERE active = 1 ORDER BY sort, id');
}

/**
 * On-road price engine. Driven ONLY by admin tables (variants, price_rules, offers, models.accessories_amount, cities).
 * Rule lookup: price_rules row for (city, model) if present, else the city-wide row (model_id NULL); active rows only.
 *
 *   ex        = variant.ex_showroom
 *   road_tax  = round(ex * (ex > rule.road_tax_threshold ? rule.road_tax_pct_high : rule.road_tax_pct) / 100)
 *   reg       = rule.registration_fee                       (registration + smart card)
 *   insurance = round(ex * rule.insurance_pct / 100)
 *   handling  = rule.handling ; fastag = rule.fastag
 *   tcs       = ex > rule.tcs_threshold ? round(ex * rule.tcs_pct / 100) : 0
 *   acc       = accessories flag ? model.accessories_amount : 0
 *   less      = sum(amount of offers: active, type='cash', show_in_onroad=1, not expired, model_id NULL or = variant model)
 *   on_road   = ex + road_tax + reg + insurance + handling + fastag + tcs + acc - less
 * `expired` = rule.valid_until is set and earlier than today (UI must then say "price being updated").
 */
function getOnRoadPrice(variantId, citySlug, opts = {}) {
  const v = q.get(`SELECT v.*, m.name AS model_name, m.accessories_amount, m.id AS mid FROM variants v JOIN models m ON m.id = v.model_id
                   WHERE (v.id = ? OR v.code = ?) AND v.active = 1`, /^\d+$/.test(String(variantId)) ? Number(variantId) : -1, String(variantId));
  if (!v) throw httpError(404, 'Variant not found');
  const city = q.get('SELECT id, slug, name_en, name_hi FROM cities WHERE slug = ? AND active = 1', String(citySlug || 'lucknow'));
  if (!city) throw httpError(404, 'City not found');
  const rule = q.get('SELECT * FROM price_rules WHERE city_id = ? AND model_id = ? AND active = 1', city.id, v.mid)
    || q.get('SELECT * FROM price_rules WHERE city_id = ? AND model_id IS NULL AND active = 1', city.id);
  const ex = v.ex_showroom;
  const lines = [{ key: 'ex_showroom', label_en: 'Ex-showroom price', label_hi: 'एक्स-शोरूम कीमत', amount: ex, kind: 'add' }];
  const note_en = 'Prices are indicative and may change without notice. Final on-road price is confirmed in the quotation.';
  const note_hi = 'कीमतें सांकेतिक हैं और बिना सूचना बदल सकती हैं। अंतिम ऑन-रोड कीमत कोटेशन में पुष्टि की जाती है।';
  const base = { variant: { id: v.id, name: v.name, model_name: v.model_name }, city, ex_showroom: ex, note_en, note_hi };
  if (!rule) return { ...base, lines: [...lines, { key: 'total', label_en: 'On-road price', label_hi: 'ऑन-रोड कीमत', amount: ex, kind: 'total' }], on_road: ex, valid_until: null, expired: true, no_rule: true };

  const pct = ex > rule.road_tax_threshold ? rule.road_tax_pct_high : rule.road_tax_pct;
  const add = (key, en, hi, amount) => { if (amount) lines.push({ key, label_en: en, label_hi: hi, amount: Math.round(amount), kind: 'add' }); };
  add('road_tax', `Road tax (${pct}%)`, `रोड टैक्स (${pct}%)`, ex * pct / 100);
  add('registration', 'Registration & smart card', 'पंजीकरण और स्मार्ट कार्ड', rule.registration_fee);
  add('insurance', 'Insurance', 'बीमा', ex * rule.insurance_pct / 100);
  add('handling', 'Handling & logistics', 'हैंडलिंग और लॉजिस्टिक्स', rule.handling);
  add('fastag', 'FASTag', 'फास्टैग', rule.fastag);
  add('tcs', `TCS (${rule.tcs_pct}%)`, `टीसीएस (${rule.tcs_pct}%)`, ex > rule.tcs_threshold ? ex * rule.tcs_pct / 100 : 0);
  if (opts && (opts.accessories === true || opts.accessories === '1' || opts.accessories === 1 || opts.accessories === 'true')) {
    add('accessories', 'Accessories package', 'एक्सेसरीज़ पैकेज', v.accessories_amount);
  }
  const offs = q.all(`SELECT * FROM offers WHERE active = 1 AND type = 'cash' AND show_in_onroad = 1 AND amount > 0
                      AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ?) AND (model_id IS NULL OR model_id = ?)`, today(), v.mid);
  for (const o of offs) lines.push({ key: 'offer_' + o.id, label_en: `Less: ${o.title_en}`, label_hi: `घटाएं: ${o.title_hi || o.title_en}`, amount: o.amount, kind: 'less' });
  let total = 0;
  for (const l of lines) total += l.kind === 'less' ? -l.amount : l.amount;
  lines.push({ key: 'total', label_en: 'On-road price', label_hi: 'ऑन-रोड कीमत', amount: total, kind: 'total' });
  const expired = !!(rule.valid_until && rule.valid_until < today());
  return { ...base, lines, on_road: total, valid_until: rule.valid_until, expired, note_en, note_hi };
}

/** Pure EMI calculator. rate = annual % p.a. */
function emi({ principal, rate, months, downPayment = 0 } = {}) {
  const P = toNum(principal, 0), n = Math.round(toNum(months, 0)), dp = toNum(downPayment, 0), r = toNum(rate, 0) / 1200;
  if (!(P > 0) || !(n > 0) || n > 120 || r < 0 || dp < 0) throw httpError(400, 'Invalid EMI inputs');
  const loan = Math.max(0, P - dp);
  if (loan === 0) return { loan: 0, emi: 0, total_payable: 0, interest: 0 };
  const e = r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const emiR = Math.round(e);
  return { loan: Math.round(loan), emi: emiR, total_payable: emiR * n, interest: emiR * n - Math.round(loan) };
}

/** EMI defaults live in the settings table (admin editable). */
function emiDefaults() {
  return { rate: toNum(getSetting('emi_rate', '9.5'), 9.5), months: toNum(getSetting('emi_months', '60'), 60), down_pct: toNum(getSetting('emi_down_pct', '20'), 20) };
}

module.exports = { listModels, getModel, listCities, getOnRoadPrice, listOffers, listBanners, emi, emiDefaults };
