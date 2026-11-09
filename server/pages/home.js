'use strict';
// Home v2: "Night Garage" hero, model rail, EMI-first budget filter, 4-question matcher, trust band, showrooms, CTA.
const V = require('../views/layout');
const { esc, inr, lakh, L, ICON, imgUrl, img, page } = V;
const C = require('./components');
const M = require('../views/media');
const I18N = require('../views/i18n');
const { svc } = C;

const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
const GHOST = 'M0,20H140C230,20 290,75 290,150C290,225 230,280 140,280H0ZM70,80V220H130C175,220 215,195 215,150C215,105 175,80 130,80Z M330,20H465C545,20 595,60 595,120C595,160 575,190 540,205L610,280H525L465,215H400V280H330ZM400,78V160H460C490,160 520,148 520,119C520,90 490,78 460,78Z M650,20H720V280H650Z M770,20H845L910,210L975,20H1050L945,280H875Z M1090,20H1290V80H1160V120H1270V175H1160V220H1290V280H1090Z';
const DEFAULT_STATS = { new_cars_per_year: 6000, used_cars_per_year: 900 };

const cache = { t: 0, v: null };
function modelsWithPrice() { // [{...model, variants, onroad}] cached 60s
  if (cache.v && Date.now() - cache.t < 60000) return cache.v;
  const out = safe(() => svc.catalog.listModels(), []).map(m => {
    const full = safe(() => svc.catalog.getModel(m.slug), null);
    const vs = (full && full.variants) || [];
    const v0 = vs.slice().sort((a, b) => a.ex_showroom - b.ex_showroom)[0];
    const p = v0 ? safe(() => svc.catalog.getOnRoadPrice(v0.id, 'lucknow', {}), null) : null;
    return Object.assign({}, m, { onroad: p && !p.expired ? p.on_road : null, features: full && full.highlights || [] });
  });
  cache.v = out; cache.t = Date.now(); return out;
}
function nextSlot(shows, models, lang) {
  const sh = shows[0], mo = models[0]; if (!sh || !mo) return null;
  for (let off = 0; off < 4; off++) {
    const date = new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
    const slots = safe(() => svc.sales.listTestDriveSlots({ showroomId: sh.id, modelId: mo.id, date }), []);
    const s = slots.find(x => x.available);
    if (s) return { date, time: s.time, off, showroom: L(sh, 'name', lang).replace(/^Company A Motors\s*-\s*/, '').replace(/^कंपनी ए मोटर्स\s*-\s*/, '') };
  }
  return null;
}
function fmtTime(t) { const [h, m] = String(t).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`; }
function dayLabel(slot, t, lang) {
  if (slot.off === 0) return t('today'); if (slot.off === 1) return t('tomorrow');
  return new Date(slot.date + 'T00:00:00').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function home(ctx) {
  const t = I18N.make(ctx.lang); const lang = ctx.lang;
  const models = modelsWithPrice();
  const bm = C.bodyMap();
  const usedRes = safe(() => svc.used.listUsed({ status: 'available', sort: 'new', page: 1, pageSize: 8 }), { items: [] });
  const usedItems = usedRes.items || [];
  const offers = safe(() => svc.catalog.listOffers({ active: true }), []).slice(0, 3);
  const shows = safe(() => svc.sales.listShowrooms(), []);
  const works = safe(() => svc.sales.listWorkshops(), []);
  let st = DEFAULT_STATS, emi = { rate: 9.5, months: 60, down_pct: 20 };
  try { const ps = require('../services/admin').publicSettings(); st = Object.assign({}, DEFAULT_STATS, ps.site_stats || {}); emi = Object.assign(emi, ps.emi || {}); } catch (e) { /* defaults */ }
  const slot = nextSlot(shows, models, lang);
  const cheapest = models.filter(m => m.from_price).sort((a, b) => a.from_price - b.from_price)[0];
  const hx = (m) => m.colors && m.colors[0] && m.colors[0].hex;
  const heroSrc = (m) => { const h = M.car(m.slug, 'hero', m.body_type, hx(m)); return h.photo ? h : M.car(m.slug, 'side', m.body_type, hx(m)); };
  const slides = models.slice(0, 4);

  /* ---------- hero ---------- */
  const hs = slides.map((m, i) => { const h = heroSrc(m); return `<figure class="h3-slide${i ? '' : ' on'}" data-slide="${i}">${img(h.src, '', { w: h.w, h: h.h, eager: i === 0, sizes: '100vw' })}</figure>`; }).join('');
  const names = slides.map((m, i) => `<a class="h3-cap${i ? '' : ' on'}" data-cap="${i}" href="/new-cars/${esc(m.slug)}" ${i ? 'tabindex="-1" aria-hidden="true"' : ''}><b>${esc(m.name)}</b><span>${esc(t(m.body_type))}${m.from_price ? ' · ' + esc(t('from')) + ' ' + esc(lakh(m.from_price)) : ''}</span></a>`).join('');
  const dots = slides.map((m, i) => `<button type="button" class="dot-b${i ? '' : ' on'}" data-go="${i}" aria-label="${esc(t('slide_n') + ' ' + (i + 1) + ': ' + m.name)}"></button>`).join('');
  const slotChip = slot ? `<a class="chip3 rise" style="--d:560" href="/test-drive"><i class="live" aria-hidden="true"></i><span><small>${esc(t('next_td'))}</small><b>${esc(dayLabel(slot, t, lang))}, ${esc(fmtTime(slot.time))}</b> <em class="muted-n">${esc(slot.showroom)}</em></span></a>` : '';
  const priceChip = cheapest ? `<a class="chip3 rise" style="--d:640" href="/new-cars"><span><small>${esc(t('from_chip'))}</small><b>${esc(lakh(cheapest.from_price))}</b></span></a>` : '';
  const hero = `<section class="hero3 night" data-tone="night" aria-roledescription="carousel" aria-label="${esc(t('hero_aria'))}"><div class="h3-bg" data-cursor="${esc(t('view_details'))}">${hs}<div class="h3-shade" aria-hidden="true"></div></div>
<svg class="h3-ghost" aria-hidden="true" focusable="false" viewBox="0 0 1300 300"><path fill-rule="evenodd" d="${GHOST}"/></svg><span class="h3-strip" aria-hidden="true"></span>
<div class="wrap h3-in"><ul class="eyebrow rise" style="--d:100"><li>${esc(t('hero_eyebrow1'))}</li><li>${esc(t('hero_eyebrow2'))}</li><li>${esc(t('hero_eyebrow3'))}</li></ul>
<h1 class="h1 xl h3-h" data-split>${esc(t('h3_a'))} ${esc(t('h3_b'))} <em>${esc(t('h3_c'))}</em><span class="dot">.</span></h1>
<p class="lead rise" style="--d:360">${esc(t('h3_sub'))}</p>
<div class="cta-row rise" style="--d:460"><a class="btn btn-red" data-mag href="/test-drive">${esc(t('book_td'))} ${ICON.arrow}</a><a class="btn btn-ghost" data-mag href="/new-cars">${esc(t('explore_new'))} ${ICON.arrow}</a></div>
<div class="h3-chips">${slotChip}${priceChip}</div></div>
<div class="wrap h3-foot"><div class="h3-caps" aria-live="polite">${names}</div><div class="h3-ctl"><button class="circ" type="button" data-prev aria-label="${esc(t('prev'))}">${ICON.left}</button><div class="dots">${dots}</div><button class="circ" type="button" data-next aria-label="${esc(t('next'))}">${ICON.arrow}</button></div></div>
<a class="h3-scroll" href="#trust" aria-label="${esc(t('scroll_cue'))}"><span></span></a></section>`;

  /* ---------- trust band ---------- */
  const tn = (n, suf, label, k) => `<li><strong data-count="${n}" data-suffix="${suf}">${Number(n).toLocaleString('en-IN')}${suf}</strong><span>${esc(label)}</span></li>`;
  const trust = `<section class="trust night" id="trust" data-tone="night"><div class="wrap"><ul class="tr-list">${tn(Number(st.new_cars_per_year), '+', t('tr_cars'))}${tn(shows.length || 3, '', t('tr_show'))}${tn(works.length || 2, '', t('tr_work'))}${tn(100, '', t('tr_insp'))}${tn(5, '', t('tr_resp'))}</ul></div></section>`;

  /* ---------- rail ---------- */
  const rail = `<section class="mrail night" id="rail" data-tone="night" data-rail><div class="rail-pin"><div class="wrap rail-head"><p class="script">${esc(t('script_tag'))}</p><h2 class="h2" data-split>${esc(t('rail_a'))} <em>${esc(t('rail_b'))}</em><span class="dot">.</span></h2><p class="lead">${esc(t('rail_sub'))}</p></div>
<div class="rail-view" data-cursor="${esc(t('rail_hint').split(' ')[0].toUpperCase())}"><div class="rail-track" data-track>${models.map((m, i) => { const s = M.car(m.slug, 'side', m.body_type, hx(m)); return `<article class="rail-slide" data-i="${i}"><div class="rs-txt"><span class="rs-n" aria-hidden="true">${esc(m.name.replace(/^Model\s*/i, ''))}</span><p class="eyebrow-s">${esc(t(m.body_type))}</p><h3>${esc(m.name)}</h3><p class="muted-n">${esc(L(m, 'tagline', lang))}</p><dl class="rs-p"><div><dt>${esc(t('from'))} ${esc(t('ex_showroom'))}</dt><dd>${esc(lakh(m.from_price))}</dd></div>${m.onroad ? `<div><dt>${esc(t('onroad_lko'))}</dt><dd>${esc(inr(m.onroad))}</dd></div>` : ''}</dl><div class="cta-row"><a class="btn btn-red" href="/new-cars/${esc(m.slug)}">${esc(t('rail_explore'))} ${ICON.arrow}</a><a class="btn btn-ghost" href="/compare?m=${esc(m.slug)}">${esc(t('rail_compare'))}</a></div></div><a class="rs-img" href="/new-cars/${esc(m.slug)}" tabindex="-1" aria-hidden="true">${img(s.src, m.name, { w: s.w, h: s.h, sizes: '(min-width:900px) 52vw, 86vw' })}</a></article>`; }).join('')}</div></div>
<div class="wrap rail-bar" aria-hidden="true"><div class="rail-prog"><i data-prog></i></div><ol>${models.map((m, i) => `<li data-t="${i}">${esc(m.name)}</li>`).join('')}</ol></div></div></section>`;

  /* ---------- budget ---------- */
  const defEmi = 25000, defMonths = [36, 48, 60, 84].includes(Number(emi.months)) ? Number(emi.months) : 60, defDp = 20;
  const defMax = (() => { const i = (Number(emi.rate) || 9.5) / 1200, loan = defEmi * (1 - Math.pow(1 + i, -defMonths)) / i; return loan / (1 - defDp / 100); })();
  const lakhFmt = (n) => lakh(n);
  const cards = [];
  models.forEach(m => { if (m.onroad || m.from_price) cards.push({ k: 'new', price: m.onroad || m.from_price, html: C.modelCard(m, t, lang) }); });
  usedItems.slice(0, 4).forEach(u => cards.push({ k: 'used', price: u.price, html: C.usedCard(u, t, lang, bm) }));
  const budget = `<section class="bud sec" id="budget"><div class="wrap"><div class="bud-top"><h2 class="h2" data-split>${esc(t('bud_a'))} <em>${esc(t('bud_b'))}</em><span class="dot">.</span></h2><p class="lead">${esc(t('bud_sub'))}</p></div><div class="bud-layout">
<div class="bud-ctl" data-budget data-rate="${esc(emi.rate)}"><label class="bud-lab" for="b-emi">${esc(t('emi_calc'))}</label><div class="bud-out"><output id="b-out" for="b-emi" class="odo" aria-live="polite">${esc(inr(25000))}</output><span>${esc(t('bud_month'))}</span></div><input id="b-emi" type="range" min="8000" max="80000" step="1000" value="25000" style="--fill:${Math.round((25000 - 8000) / 72000 * 100)}%" aria-valuetext="${esc(inr(25000))}">
<div class="bud-row"><fieldset class="seg-c"><legend>${esc(t('bud_tenure'))}</legend>${[36, 48, 60, 84].map(n => `<label><input type="radio" name="b-ten" value="${n}"${n === (Number(emi.months) || 60) || (n === 60 && ![36, 48, 60, 84].includes(Number(emi.months))) ? ' checked' : ''}><span>${n} ${esc(t('months_unit'))}</span></label>`).join('')}</fieldset><fieldset class="seg-c"><legend>${esc(t('bud_down'))}</legend>${[10, 20, 30].map(n => `<label><input type="radio" name="b-dp" value="${n}"${n === 20 ? ' checked' : ''}><span>${n}%</span></label>`).join('')}</fieldset></div>
<p class="bud-sum" aria-live="polite"><span>${esc(t('bud_upto'))}</span> <b class="odo" id="b-max" data-v="${Math.round(defMax)}">${esc(lakhFmt(defMax))}</b> <small id="b-cnt">${cards.filter(c => c.price <= defMax).length} ${esc(t('bud_match'))}</small></p><p class="muted small">${esc(t('bud_assume'))} ${esc(emi.rate)}% p.a. ${esc(t('bud_note'))}</p>
<div class="cta-row"><a class="btn btn-sm" id="b-new" href="/new-cars?maxPrice=${Math.round(defMax)}"${cards.some(c => c.k === 'new' && c.price <= defMax) ? '' : ' aria-disabled="true" tabindex="-1"'}>${esc(t('bud_see_new'))} ${ICON.arrow}</a><a class="btn btn-sm btn-o" id="b-used" href="/used-cars?maxPrice=${Math.round(defMax)}"${cards.some(c => c.k === 'used' && c.price <= defMax) ? '' : ' aria-disabled="true" tabindex="-1"'}>${esc(t('bud_see_used'))} ${ICON.arrow}</a></div></div>
<div><div class="bud-grid grid g3" id="b-grid">${cards.map(c => `<div class="bi" data-k="${c.k}" data-p="${Math.round(c.price)}"${c.price > defMax ? ' hidden' : ''}>${c.html}</div>`).join('')}</div><p class="empty" id="b-none"${cards.some(c => c.price <= defMax) ? ' hidden' : ''}>${esc(t('bud_none'))}</p></div></div></div></section>`;

  /* ---------- finder ---------- */
  const opt = (name, v, label) => `<label class="fd-o"><input type="radio" name="${name}" value="${v}"><span>${esc(label)}</span></label>`;
  const finder = `<section class="fd night" data-tone="night"><div class="wrap fd-in"><div><p class="script">${esc(t('script_tag'))}</p><h2 class="h2" data-split>${esc(t('fd_a'))} <em>${esc(t('fd_b'))}</em><span class="dot">.</span></h2><p class="lead">${esc(t('fd_sub'))}</p><button class="btn btn-red" type="button" data-mag data-finder-open aria-haspopup="dialog">${esc(t('fd_open'))} ${ICON.arrow}</button></div><ol class="fd-peek" aria-hidden="true"><li>01 ${esc(t('fd_q1'))}</li><li>02 ${esc(t('fd_q2'))}</li><li>03 ${esc(t('fd_q3'))}</li><li>04 ${esc(t('fd_q4'))}</li></ol></div></section>
<dialog class="fdlg night" id="finder" aria-labelledby="fd-title"><form method="dialog" class="fd-f" novalidate><div class="fd-top"><p id="fd-title" class="eyebrow-s"></p><button class="circ" type="button" data-close aria-label="${esc(t('fd_close'))}">&times;</button></div><div class="fd-prog" aria-hidden="true"><i></i></div>
<div class="fd-step" data-s="1" hidden><h3 class="fd-q">${esc(t('fd_q1'))}</h3><div class="fd-opts">${opt('who', 'solo', t('fd_q1a'))}${opt('who', 'two', t('fd_q1b'))}${opt('who', 'fam', t('fd_q1c'))}${opt('who', 'big', t('fd_q1d'))}</div></div>
<div class="fd-step" data-s="2" hidden><h3 class="fd-q">${esc(t('fd_q2'))}</h3><div class="fd-opts">${opt('where', 'city', t('fd_q2a'))}${opt('where', 'hwy', t('fd_q2b'))}${opt('where', 'mix', t('fd_q2c'))}</div></div>
<div class="fd-step" data-s="3" hidden><h3 class="fd-q">${esc(t('fd_q3'))}</h3><div class="bud-out"><output id="fd-emi-o" class="odo">${esc(inr(25000))}</output><span>${esc(t('bud_month'))}</span></div><label class="sr" for="fd-emi">${esc(t('fd_q3'))}</label><input id="fd-emi" type="range" min="8000" max="80000" step="1000" value="25000"></div>
<div class="fd-step" data-s="4" hidden><h3 class="fd-q">${esc(t('fd_q4'))}</h3><div class="fd-opts">${opt('prio', 'eff', t('fd_q4a'))}${opt('prio', 'space', t('fd_q4b'))}${opt('prio', 'comfort', t('fd_q4c'))}${opt('prio', 'feat', t('fd_q4d'))}</div></div>
<div class="fd-step" data-s="5" hidden><h3 class="fd-q">${esc(t('fd_res'))}</h3><ol class="fd-res" id="fd-res"></ol></div>
<p class="err fd-err" role="alert" hidden>${esc(t('fd_none'))}</p><div class="fd-nav"><button class="btn btn-ghost" type="button" data-back>${esc(t('fd_back'))}</button><button class="btn btn-red" type="button" data-next>${esc(t('fd_next'))} ${ICON.arrow}</button><button class="btn btn-ghost" type="button" data-again hidden>${esc(t('fd_again'))}</button></div></form></dialog>`;

  /* ---------- showrooms + offers + CTA ---------- */
  const loc = `<section class="sec loc"><div class="wrap"><h2 class="h2" data-split>${esc(t('loc_a'))} <em>${esc(t('loc_b'))}</em><span class="dot">.</span></h2><div class="grid g3">${shows.concat(works).map(s => `<article class="loc-c reveal"><span class="chip">${s.bays ? esc(t('workshops')) : esc(t('showrooms'))}</span><h3>${esc(L(s, 'name', lang).replace(/^(Company A Motors|Company A Service)\s*-\s*/, ''))}</h3><p>${esc(L(s, 'address', lang))}</p>${s.hours ? `<p class="muted small">${esc(t('hours'))}: ${esc(typeof s.hours === 'string' ? s.hours : '')}</p>` : ''}<div class="cta-row">${s.phone ? `<a class="btn btn-sm" href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(t('call'))}</a>` : ''}${s.lat ? `<a class="btn btn-sm btn-o" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${esc(s.lat)},${esc(s.lng)}">${esc(t('directions'))}</a>` : ''}</div></article>`).join('')}</div></div></section>`;
  const offersH = offers.length ? `<section class="sec sec-grey"><div class="wrap"><h2 class="h2" data-split>${esc(t('offers'))}<span class="dot">.</span></h2><div class="grid g3">${offers.map(o => `<article class="offer reveal"><span class="badge">${esc(t('new_arrival'))}</span><h3>${esc(L(o, 'title', lang))}</h3><p>${esc(L(o, 'body', lang))}</p>${o.valid_until ? `<small class="muted">${esc(t('valid_until'))} ${esc(o.valid_until)}</small>` : ''}</article>`).join('')}</div></div></section>` : '';
  const cta = `<section class="cta3 night" data-tone="night"><div class="wrap"><h2 class="h1 xl" data-split>${esc(t('cta_a'))} <em>${esc(t('cta_b'))}</em><span class="dot">.</span></h2><p class="lead">${esc(t('cta_sub'))}</p><div class="cta-row"><a class="btn btn-red" data-mag href="/test-drive">${esc(t('book_td'))} ${ICON.arrow}</a><a class="btn btn-ghost" data-mag href="/emi">${esc(t('emi_calc'))}</a></div></div></section>`;

  /* ---------- data for the matcher / budget scripts ---------- */
  const data = {
    emi, lang,
    cars: models.map(m => ({ k: 'new', slug: m.slug, name: m.name, body: m.body_type, fuels: m.fuel_types || [], price: m.onroad || m.from_price || 0, url: '/new-cars/' + m.slug, img: (M.car(m.slug, 'side', m.body_type, hx(m)).src) }))
      .concat(usedItems.map(u => ({ k: 'used', slug: u.slug, name: u.title || [u.year, u.model, u.variant].filter(Boolean).join(' '), body: C.usedBody(u, bm), fuels: [u.fuel], price: u.price, url: '/used-cars/' + u.slug, img: C.usedPhotos(u)[0] || '', km: u.km, year: u.year })))
  };
  const body = `${hero}${trust}${rail}${budget}${finder}${offersH}${loc}${cta}<script type="application/json" id="home-data">${V.jsonSafe(data)}</script><script>window.__F=${V.jsonSafe(Object.assign({ b: t('bud_upto') }, I18N.group(lang, 'fd_'), I18N.group(lang, 'fr_'), I18N.group(lang, 'bud_'), { kind_new: t('kind_new'), kind_used: t('kind_used'), view_details: t('view_details'), onroad: t('on_road'), onroad_lko: t('onroad_lko'), price: t('price_lbl') }))};</script>`;
  const hs0 = slides[0] ? heroSrc(slides[0]) : null;
  return ctx.html(page({ ctx, path: '/', title: lang === 'hi' ? 'Brand X कारें लखनऊ' : 'Brand X new & certified used cars in Lucknow', desc: t('h3_sub'), body, jsonld: [V.dealerLd(shows, lang)], bodyClass: 'home', css: ['/css/home2.css'], preload: hs0 ? { src: hs0.src, sizes: '100vw' } : null, scripts: ['/js/home2.js', '/js/forms.js'] }));
}
module.exports = { home, modelsWithPrice };
