'use strict';
const V = require('../views/layout');
const { esc, inr, lakh, L, ICON, imgUrl, img } = V;
const M = require('../views/media');

let catalog, used, sales, seo;
const lazy = (n) => require('../services/' + n);
const svc = {
  get catalog() { return catalog || (catalog = lazy('catalog')); },
  get used() { return used || (used = lazy('used')); },
  get sales() { return sales || (sales = lazy('sales')); },
  get seo() { if (seo === undefined) { try { seo = lazy('seo'); } catch (e) { seo = null; } } return seo; }
};

const COLORS = { white: 'f2f2f0', black: '121214', silver: 'b8bbc0', grey: '6b6f76', gray: '6b6f76', red: 'b3122d', blue: '1f3f7a', brown: '5a3d2b', orange: 'c85a17', green: '2f5d46', beige: 'c9b79c', maroon: '5b1020' };
const colorHex = (name) => { const n = String(name || '').toLowerCase(); for (const k in COLORS) if (n.indexOf(k) >= 0) return COLORS[k]; return '1c1c1f'; };

function bodyMap() {
  const m = {};
  try { svc.catalog.listModels().forEach(x => { m[String(x.name).toLowerCase()] = x.body_type; m[x.slug] = x.body_type; }); } catch (e) { /* ignore */ }
  return m;
}
function usedBody(u, bm) {
  const n = String(u.model || u.title || '').toLowerCase();
  for (const k in bm) if (n.indexOf(k) === 0 || String(u.slug || '').indexOf(k.replace(/\s+/g, '-')) >= 0) return bm[k];
  return 'sedan';
}
// Real photos only: API photo URLs (non-generated) then img/used/<stock>.jpg. Never an SVG-generated or new-car stand-in.
function usedPhotos(u) {
  const out = (u.photos || []).filter(p => p && !String(p).startsWith('/img/car/') && !/\.svg(\?|$)/i.test(String(p)));
  if (u.photo && !out.includes(u.photo) && !/\.svg/i.test(u.photo)) out.unshift(u.photo);
  const ph = M.used(u.stock_id);
  if (ph && !out.includes(ph)) out.unshift(ph);
  return out;
}
// neutral state with the body-type silhouette (desaturated) only when a photo is truly missing
function usedMedia(u, bm, t, o) {
  o = o || {}; const ph = usedPhotos(u);
  const title = u.title || [u.year, u.model, u.variant].filter(Boolean).join(' ');
  if (ph.length) return img(ph[0], title, { w: 1200, h: 900, sizes: o.sizes, eager: o.eager });
  return `<span class="ph" role="img" aria-label="${esc(t('photos_soon'))}"><img src="${esc(imgUrl(u.slug || 'used', usedBody(u, bm), '8b8d93'))}" alt="" width="800" height="400" loading="lazy" decoding="async"><b>${esc(t('photos_soon'))}</b></span>`;
}
function usedLocation(u, lang) {
  if (lang === 'hi') {
    if (u.location_hi) return u.location_hi;
    try { const y = svc.sales.listYard && svc.sales.listYard(); if (y && u.location && /faizabad/i.test(u.location)) return L(y, 'name', 'hi') || u.location; } catch (e) { /* ignore */ }
  }
  return u.location;
}

function carHero(m, o) { // card/hero image: uploaded hero > photo > svg
  o = o || {};
  if (m.hero_image && !String(m.hero_image).startsWith('/img/car/')) return img(m.hero_image, m.name, o);
  const c = M.car(m.slug, o.kind || 'side', m.body_type, m.colors && m.colors[0] && m.colors[0].hex);
  return img(c.src, m.name, Object.assign({ w: c.w, h: c.h }, o));
}

function modelCard(m, t, lang) {
  const fuels = (m.fuel_types || []).map(f => `<span class="chip">${esc(f)}</span>`).join('');
  return `<article class="card mcard reveal" data-tilt><a class="card-img" href="/new-cars/${esc(m.slug)}" tabindex="-1" aria-hidden="true">${carHero(m, {})}</a>
<div class="card-b"><div class="chips">${fuels}</div><h3><a href="/new-cars/${esc(m.slug)}">${esc(m.name)}</a></h3><p class="muted">${esc(L(m, 'tagline', lang))}</p>
<button class="heart" type="button" data-save="${esc(m.slug)}" aria-pressed="false" aria-label="${esc(t('save') + ': ' + m.name)}">${ICON.heart}</button><label class="cmp"><input type="checkbox" data-cmp="${esc(m.slug)}" data-name="${esc(m.name)}"><span>${esc(t('compare'))}</span></label><div class="card-f"><div><small>${esc(t('from'))} ${esc(t('ex_showroom'))}</small><strong class="price">${esc(lakh(m.from_price))}</strong></div><a class="circ" href="/new-cars/${esc(m.slug)}" aria-label="${esc(t('view_details') + ': ' + m.name)}">${ICON.arrow}</a></div></div></article>`;
}

function usedCard(u, t, lang, bm) {
  const sold = u.status === 'booked' || u.status === 'sold';
  const badge = sold ? `<span class="badge badge-dark">${esc(t(u.status))}</span>` : (u.featured ? `<span class="badge">${esc(t('featured'))}</span>` : `<span class="badge badge-line">${esc(t('verified'))}</span>`);
  const title = u.title || [u.year, u.model, u.variant].filter(Boolean).join(' ');
  return `<article class="card ucard reveal" data-tilt><a class="card-img" href="/used-cars/${esc(u.slug)}" tabindex="-1" aria-hidden="true">${usedMedia(u, bm, t, { sizes: '(min-width:1100px) 340px, (min-width:600px) 45vw, 100vw' })}</a>${badge}
<button class="heart" type="button" data-save="${esc(u.slug)}" aria-pressed="false" aria-label="${esc(t('save') + ': ' + title)}">${ICON.heart}</button>
<div class="card-b"><h3><a href="/used-cars/${esc(u.slug)}">${esc(title)}</a></h3><p class="muted">${esc([u.variant, u.transmission].filter(Boolean).join(' · '))}</p>
<ul class="meta"><li>${esc(u.year)}</li><li>${esc(u.fuel)}</li><li>${esc(Number(u.km || 0).toLocaleString('en-IN'))} ${esc(t('km'))}</li></ul>
<div class="card-f"><strong class="price">${esc(inr(u.price))}</strong><a class="circ" href="/used-cars/${esc(u.slug)}" aria-label="${esc(t('view_details') + ': ' + title)}">${ICON.arrow}</a></div></div></article>`;
}

function breakup(p, t, lang) {
  if (!p) return `<p class="muted">${esc(t('price_updating'))}</p>`;
  if (p.expired) return `<div class="notice"><p><strong>${esc(t('price_updating'))}</strong></p><a class="btn" href="/test-drive">${esc(t('request_quote'))} ${ICON.arrow}</a></div>`;
  const grp = { ex_showroom: 'a', road_tax: 'b', tcs: 'b', registration: 'b', insurance: 'c', handling: 'd', fastag: 'd', accessories: 'd' }; const seg = { a: 0, b: 0, c: 0, d: 0 }; (p.lines || []).forEach(l => { if (l.kind === 'add') seg[grp[l.key] || 'd'] += l.amount; }); const tot = seg.a + seg.b + seg.c + seg.d || 1;
  const names = { a: t('ex_showroom'), b: t('seg_tax'), c: t('seg_ins'), d: t('seg_other') };
  const bar = `<div class="seg" role="img" aria-label="${esc(t('price_breakup'))}">${['a', 'b', 'c', 'd'].map(k => seg[k] ? `<i class="s-${k}" style="flex:${seg[k] / tot}" title="${esc(names[k])}"></i>` : '').join('')}</div><ul class="seg-l">${['a', 'b', 'c', 'd'].map(k => seg[k] ? `<li><i class="s-${k}"></i>${esc(names[k])} <b>${Math.round(seg[k] / tot * 100)}%</b></li>` : '').join('')}</ul>`;
  const rows = (p.lines || []).map(l => `<tr class="${l.kind === 'total' ? 'tot' : ''}"><th scope="row">${esc(L(l, 'label', lang))}</th><td>${l.kind === 'less' ? '− ' : ''}${esc(inr(Math.abs(l.amount)))}</td></tr>`).join('');
  return `${bar}<table class="bk"><caption class="sr">${esc(t('price_breakup'))}</caption><tbody>${rows}</tbody></table>
<p class="valid">${esc(t('valid_until'))}: <time datetime="${esc(p.valid_until)}">${esc(p.valid_until)}</time></p><p class="muted small">${esc(L(p, 'note', lang) || t('price_note'))}</p>`;
}

function emiWidget(t, o) { // {price, rate, months, id}
  const price = Math.round(o.price || 0); const rate = o.rate || 9.5; const months = o.months || 60;
  const dp = Math.round(price * 0.2);
  const sl = (name, label, min, max, step, val) => `<div class="sl"><label for="e-${name}">${esc(label)}</label><output id="o-${name}" for="e-${name}"></output><input type="range" id="e-${name}" name="${name}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  return `<div class="emi" data-emi data-price="${price}">
<div class="emi-in">${o.editablePrice ? sl('price', t('car_price'), 200000, 5000000, 10000, price || 1000000) : ''}
${sl('dp', t('down_payment'), 0, Math.max(price, 1000000), 5000, dp)}${sl('rate', t('rate'), 6, 18, 0.1, rate)}${sl('months', t('tenure'), 12, 84, 6, months)}</div>
<div class="emi-out" aria-live="polite"><small>${esc(t('monthly_emi'))}</small><strong class="price big" data-out="emi">—</strong>
<dl><div><dt>${esc(t('loan_amount'))}</dt><dd data-out="loan"></dd></div><div><dt>${esc(t('total_interest'))}</dt><dd data-out="interest"></dd></div><div><dt>${esc(t('total_payable'))}</dt><dd data-out="total"></dd></div></dl></div>
<p class="muted small">${esc(t('emi_note'))}</p></div>`;
}

function leadForm(t, o) { // {source,type,modelId,usedId,variantId,btn,extra,message,id}
  const attrs = `data-lead data-source="${esc(o.source || 'website')}" data-type="${esc(o.type || 'enquiry')}"${o.modelId ? ` data-model="${esc(o.modelId)}"` : ''}${o.usedId ? ` data-used="${esc(o.usedId)}"` : ''}${o.variantId ? ` data-variant="${esc(o.variantId)}"` : ''}`;
  return `<form class="form" method="post" action="/forms/lead" novalidate ${attrs}>
<input type="hidden" name="source" value="${esc(o.source || 'website')}"><input type="hidden" name="type" value="${esc(o.type || 'enquiry')}">${o.modelId ? `<input type="hidden" name="modelId" value="${esc(o.modelId)}">` : ''}${o.usedId ? `<input type="hidden" name="usedId" value="${esc(o.usedId)}">` : ''}${o.variantId ? `<input type="hidden" name="variantId" value="${esc(o.variantId)}">` : ''}
${V.personFields(t)}${o.extra || ''}${V.field(t, { name: 'message', label: t('message'), type: 'textarea', value: o.message || '' })}
${V.consentField(t, 'c-' + (o.id || 'x'))}<div class="form-msg" role="status" aria-live="polite"></div>
<button class="btn" type="submit">${esc(o.btn || t('submit'))} ${ICON.arrow}</button></form>`;
}

function hdr(o) { // page header
  return `<section class="phead"><div class="wrap"><h1 class="h1" data-split>${o.title}<span class="dot">.</span></h1>${o.sub ? `<p class="lead">${esc(o.sub)}</p>` : ''}</div></section>`;
}

module.exports = { svc, colorHex, bodyMap, usedBody, usedPhotos, usedMedia, usedLocation, carHero, modelCard, usedCard, breakup, emiWidget, leadForm, hdr };
