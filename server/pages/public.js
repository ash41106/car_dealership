'use strict';
const V = require('../views/layout');
const { esc, inr, lakh, L, ICON, imgUrl, img, page, crumbsLd, crumbsHtml, consentField, field, personFields, BASE } = V;
const C = require('./components');
const M = require('../views/media');
const { svc } = C;

function ctxT(ctx) { return V.make(ctx.lang); }
// calendar dates are Lucknow dates (IST), independent of the server timezone
function today(off) { return new Date(Date.now() + (off || 0) * 864e5 + 19800000).toISOString().slice(0, 10); }
function dateRail(t, lang, n, sel) {
  const loc = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const chips = Array.from({ length: n }, (_, i) => { const iso = today(i), d = new Date(iso + 'T00:00:00Z'); const wd = d.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }), mo = d.toLocaleDateString(loc, { month: 'short', timeZone: 'UTC' }); return `<label class="dchip"><input type="radio" name="date" value="${iso}" required${i === sel ? ' checked' : ''}><span><small>${esc(i === 0 ? t('today') : wd)}</small><b>${d.getUTCDate()}</b><small>${esc(mo)}</small></span></label>`; }).join('');
  return `<fieldset class="dates"><legend class="h4">${esc(t('date_rail'))}</legend><div class="rail-d" data-cursor="DRAG">${chips}</div></fieldset>`;
}
const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };

// ---------- HOME ----------
// Marketing figures: backend setting site_stats {new_cars_per_year, used_cars_per_year}; these constants are only the fallback.
const DEFAULT_STATS = { new_cars_per_year: 6000, used_cars_per_year: 900 };
function siteStats() { try { return Object.assign({}, DEFAULT_STATS, require('../services/admin').publicSettings().site_stats || {}); } catch (e) { return DEFAULT_STATS; } }
function home(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const models = safe(() => svc.catalog.listModels(), []);
  const bm = C.bodyMap();
  const usedRes = safe(() => svc.used.listUsed({ status: 'available', sort: 'new', page: 1, pageSize: 8 }), { items: [] });
  const offers = safe(() => svc.catalog.listOffers({ active: true }), []).slice(0, 3);
  const banners = safe(() => svc.catalog.listBanners(), []);
  const showrooms = safe(() => svc.sales.listShowrooms(), []);
  const st = siteStats();
  const slides = (models.filter(m => m.featured).concat(models)).filter((m, i, a) => a.indexOf(m) === i).slice(0, 4);
  const types = ['hatchback', 'sedan', 'suv', 'mpv'];
  const heroSrc = (m) => { const hx = m.colors && m.colors[0] && m.colors[0].hex; const h = M.car(m.slug, 'hero', m.body_type, hx); return h.photo ? h : M.car(m.slug, 'side', m.body_type, hx); };
  const heroSlides = slides.map((m, i) => { const h = heroSrc(m); return `<figure class="slide${i ? '' : ' on'}" data-slide="${i}">${img(h.src, m.name, { w: h.w, h: h.h, eager: i === 0, sizes: '(min-width:960px) 62vw, 100vw' })}<figcaption><a href="/new-cars/${esc(m.slug)}"><strong>${esc(m.name)}</strong> <span>${esc(t('from'))} ${esc(lakh(m.from_price))}</span> ${ICON.arrow}</a></figcaption></figure>`; }).join('');
  const dots = slides.map((m, i) => `<button type="button" class="dot-b${i ? '' : ' on'}" data-go="${i}" aria-label="${esc(m.name)}"></button>`).join('');
  const banner = banners[0];
  const bgScene = null; // decorative hero background dropped: it became the LCP element
  const tiles = types.map(ty => {
    const m = models.find(x => x.body_type === ty);
    return `<a class="tile reveal" href="/new-cars?type=${ty}"><div class="tile-in">${m ? C.carHero(m, {}) : ''}<div class="tile-t"><small>${esc(t(ty))}</small><span>${esc(t('cat_' + ty))}</span></div><span class="circ circ-w">${ICON.arrow}</span></div></a>`;
  }).join('');
  const mq = [1, 2, 3, 4, 5, 6].map(i => `<span>${esc(t('mq' + i))}</span>`).join('');
  const scenes = ['mountain', 'showroom', 'city-night', 'mountain'];
  const stepLinks = ['/new-cars', '/compare', '/test-drive', '/contact'];
  const story = `<section class="story" data-story><div class="wrap story-in"><div class="story-vis" aria-hidden="true"><div class="rail"><i></i></div>${[1, 2, 3, 4].map(i => { const sc = M.sceneBg(scenes[i - 1]); return `<div class="sv sv-${i}"${sc ? ` data-bg="${esc(sc.s)}" data-bg-l="${esc(sc.l)}"` : ''}><span class="num-xl">0${i}</span><b>${esc(t('st' + i))}<i>.</i></b></div>`; }).join('')}</div>
<div><p class="script">${esc(t('script_tag'))}</p>${V.heading(t('story_a'), t('story_b'))}<ol class="story-steps">${[1, 2, 3, 4].map(i => `<li><h3><small>0${i}</small>${esc(t('st' + i))}<span class="dot">.</span></h3><p>${esc(t('st' + i + 'b'))}</p><p><a class="btn btn-sm btn-o" href="${stepLinks[i - 1]}">${esc(t('st' + i))} ${ICON.arrow}</a></p></li>`).join('')}</ol></div></div></section>`;
  const visit = M.sceneBg('showroom');
  const body = `<section class="hero2"><div class="hero2-bg"${bgScene ? ` data-bg="${esc(bgScene.s)}" data-bg-l="${esc(bgScene.l)}"` : ' hidden'}></div><svg class="ghost" aria-hidden="true" data-par viewBox="0 0 1300 300" focusable="false"><path fill-rule="evenodd" fill="#000" d="M0,20H140C230,20 290,75 290,150C290,225 230,280 140,280H0ZM70,80V220H130C175,220 215,195 215,150C215,105 175,80 130,80Z M330,20H465C545,20 595,60 595,120C595,160 575,190 540,205L610,280H525L465,215H400V280H330ZM400,78V160H460C490,160 520,148 520,119C520,90 490,78 460,78Z M650,20H720V280H650Z M770,20H845L910,210L975,20H1050L945,280H875Z M1090,20H1290V80H1160V120H1270V175H1160V220H1290V280H1090Z"/></svg>
<div class="wrap hero2-in"><div class="hero-t"><ul class="eyebrow"><li>${esc(t('hero_eyebrow1'))}</li><li>${esc(t('hero_eyebrow2'))}</li><li>${esc(t('hero_eyebrow3'))}</li></ul>
<h1 class="h1 xl">${esc(t('hero_h1a'))}<br>${esc(t('hero_h1b'))}<span class="dot">.</span></h1><p class="lead">${esc(banner ? (L(banner, 'sub', lang) || t('hero_sub')) : t('hero_sub'))}</p>
<div class="cta-row"><a class="btn" href="/new-cars">${esc(t('explore_new'))} ${ICON.arrow}</a><a class="btn btn-o" href="/used-cars">${esc(t('browse_used'))} ${ICON.arrow}</a></div></div>
<div class="hero-visual" data-carousel><span class="slash-a" aria-hidden="true"></span><span class="slash-b" aria-hidden="true"></span><div class="vframe">${heroSlides}</div><div class="hero-ctl"><button class="circ" type="button" data-prev aria-label="${esc(t('prev'))}">${ICON.left}</button><div class="dots">${dots}</div><button class="circ" type="button" data-next aria-label="${esc(t('next'))}">${ICON.arrow}</button></div></div></div>
<div class="wrap"><ul class="stats"><li>${ICON.car}<div><strong data-count="${Number(st.new_cars_per_year)}" data-suffix="+">${Number(st.new_cars_per_year).toLocaleString('en-IN')}+</strong><span>${esc(t('stat1'))}</span></div></li><li>${ICON.shield}<div><strong data-count="${Number(st.used_cars_per_year)}" data-suffix="+">${Number(st.used_cars_per_year).toLocaleString('en-IN')}+</strong><span>${esc(t('stat2'))}</span></div></li><li>${ICON.pin}<div><strong data-count="${showrooms.length || 3}">${showrooms.length || 3}</strong><span>${esc(t('stat3'))}</span></div></li></ul></div></section>
<div class="marquee" aria-hidden="true"><div class="marquee-t">${mq}${mq}</div></div>
${story}
${usedRes.items && usedRes.items.length ? `<section class="sec sec-grey"><div class="wrap"><div class="sec-h"><div><p class="script">${esc(t('script_tag'))}</p>${V.heading(t('handpicked_a'), t('handpicked_b'))}</div><div class="ctl"><button class="circ" type="button" data-strip-prev aria-label="${esc(t('prev'))}">${ICON.left}</button><button class="circ" type="button" data-strip-next aria-label="${esc(t('next'))}">${ICON.arrow}</button></div></div>
<div class="strip" data-strip tabindex="0" aria-label="${esc(t('used_cars'))}">${usedRes.items.map(u => C.usedCard(u, t, lang, bm)).join('')}</div><p class="center"><a class="btn btn-o" href="/used-cars">${esc(t('view_all'))} ${ICON.arrow}</a></p></div></section>` : ''}
<section class="sec"><div class="wrap"><div class="sec-h"><div>${V.heading(t('perfect_a'), t('perfect_b'))}<p class="lead">${esc(t('new_cars_sub'))}</p></div></div><div class="tiles">${tiles}</div></div></section>
${models.length ? `<section class="sec sec-grey"><div class="wrap"><div class="sec-h"><h2 class="h2">${esc(t('new_cars'))}<span class="dot">.</span></h2><a class="btn btn-o" href="/new-cars">${esc(t('view_all'))} ${ICON.arrow}</a></div><div class="grid">${models.map(m => C.modelCard(m, t, lang)).join('')}</div></div></section>` : ''}
<section class="scene-band"${visit ? ` data-bg="${esc(visit.s)}" data-bg-l="${esc(visit.l)}"` : ''}><div class="wrap"><h2 class="h2">${esc(t('visit_t'))}<span class="dot">.</span></h2><p>${esc(t('visit_b'))}</p><div class="cta-row"><a class="btn btn-w" href="/contact">${esc(t('nav_contact'))} ${ICON.arrow}</a><a class="btn btn-w" href="/service">${esc(t('nav_service'))} ${ICON.arrow}</a></div></div></section>
${offers.length ? `<section class="sec"><div class="wrap"><h2 class="h2">${esc(t('offers'))}<span class="dot">.</span></h2><div class="grid g3">${offers.map(o => `<article class="offer reveal"><span class="badge">${esc(t('new_arrival'))}</span><h3>${esc(L(o, 'title', lang))}</h3><p>${esc(L(o, 'body', lang))}</p>${o.valid_until ? `<small class="muted">${esc(t('valid_until'))} ${esc(o.valid_until)}</small>` : ''}</article>`).join('')}</div></div></section>` : ''}
<section class="sec sec-grey"><div class="wrap"><h2 class="h2">${esc(t('why_us'))}<span class="dot">.</span></h2><div class="grid g4">${[1, 2, 3, 4].map(i => `<div class="why reveal"><span class="num">0${i}</span><h3>${esc(t('why' + i + 't'))}</h3><p>${esc(t('why' + i + 'b'))}</p></div>`).join('')}</div></div></section>
<section class="band"><div class="wrap band-in"><h2 class="h2 inv">${esc(t('td_title'))}<span class="dot">.</span></h2><a class="btn btn-w" href="/test-drive">${esc(t('book_td'))} ${ICON.arrow}</a></div></section>`;
  return ctx.html(page({ ctx, path: '/', title: lang === 'hi' ? 'Brand X कारें लखनऊ' : 'Brand X new & certified used cars in Lucknow', desc: t('hero_sub'), body, jsonld: [V.dealerLd(showrooms, lang)], bodyClass: 'home', preload: { src: heroSrc(slides[0] || { slug: 'model-h' }).src, sizes: '(min-width:960px) 62vw, 100vw' }, scripts: ['/js/home.js', '/js/forms.js'] }));
}

// ---------- NEW CARS ----------
function newCars(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  let models = safe(() => require('./home').modelsWithPrice(), []);
  const ty = String(ctx.query.type || '');
  if (ty) models = models.filter(m => m.body_type === ty);
  const maxP = Number(ctx.query.maxPrice) || 0;
  if (maxP) { const pr = {}; require('./home').modelsWithPrice().forEach(x => { pr[x.slug] = x.onroad || x.from_price || 0; }); models = models.filter(m => (pr[m.slug] || 0) <= maxP); }
  const tabs = ['', 'hatchback', 'sedan', 'suv', 'mpv'].map(x => `<a class="pill${x === ty ? ' on' : ''}" href="/new-cars${x ? '?type=' + x : ''}"${x === ty ? ' aria-current="true"' : ''}>${esc(x ? t(x) : t('any'))}</a>`).join('');
  const body = `${crumbsHtml([[t('new_cars'), '/new-cars']], t)}${C.hdr({ title: esc(t('new_cars')), sub: t('new_cars_sub') })}<section class="sec tight"><div class="wrap"><div class="pills">${tabs}</div>
${models.length ? `<div class="grid">${models.map(m => C.modelCard(m, t, lang)).join('')}</div>` : `<p class="empty">${esc(t('no_results'))}</p>`}</div></section>`;
  return ctx.html(page({ ctx, title: t('new_cars'), desc: t('new_cars_sub'), body, jsonld: [crumbsLd([['Home', '/'], [t('new_cars'), '/new-cars']])], scripts: ['/js/forms.js'] }));
}

// ---------- MODEL DETAIL ----------
function modelPage(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const m = svc.catalog.getModel(ctx.params.slug);
  if (!m) return notFound(ctx);
  const cities = safe(() => svc.catalog.listCities(), []);
  const city = (cities.find(c => c.slug === 'lucknow') || cities[0] || { slug: 'lucknow' }).slug;
  const v0 = (m.variants || [])[0];
  const price = v0 ? safe(() => svc.catalog.getOnRoadPrice(v0.id, city, { accessories: false }), null) : null;
  const colors = m.colors || [];
  const hx0 = colors[0] && colors[0].hex;
  const heroP = M.car(m.slug, 'hero', m.body_type, hx0), sideP = M.car(m.slug, 'side', m.body_type, hx0);
  const heroI = m.hero_image && !String(m.hero_image).startsWith('/img/car/') ? { src: m.hero_image, w: 1600, h: 900, photo: true } : (heroP.photo ? heroP : sideP);
  const hero = heroI.src;
  const sw = colors.map((c, i) => `<button type="button" class="sw${i ? '' : ' on'}" data-color="${esc(String(c.hex).replace('#', ''))}"${M.carColour(m.slug, c.name_en) ? ` data-src="${esc(M.carColour(m.slug, c.name_en))}"` : ''} style="--c:${esc(c.hex)}" aria-pressed="${i ? 'false' : 'true'}" aria-label="${esc(L(c, 'name', lang))}" title="${esc(L(c, 'name', lang))}"></button>`).join('');
  const extra = []; ['side', 'rear', 'interior'].forEach(k => { const c = M.car(m.slug, k, m.body_type, hx0); if (c.photo && c.src !== hero) extra.push({ url: c.src, alt: m.name + ' ' + k, w: c.w, h: c.h }); });
  const gal = extra.map(g => `<li>${img(g.url, g.alt, { w: g.w, h: g.h })}</li>`).join('') + (m.gallery || []).map(g => `<li>${img(g.url, L(g, 'alt', lang) || m.name)}</li>`).join('');
  const photoMode = heroI.photo;
  const tr = [...new Set((m.variants || []).map(v => v.transmission))].join(' / ');
  const sp = (re) => { const x = (m.specs || []).find(z => re.test(String(z.label_en))); return x ? [L(x, 'label', lang), x.value] : null; };
  const strip = [[ICON.fuel, t('spec_fuel'), (m.fuel_types || []).join(' / ')], [ICON.gear, t('spec_trans'), tr], [ICON.car, t('spec_body'), t(m.body_type)], [ICON.seat, t('spec_variants'), (m.variants || []).length]].concat([sp(/mileage|efficien/i), sp(/power|engine/i)].filter(Boolean).map(x => [ICON.bolt, x[0], x[1]])).filter(x => x[2]);
  const stripHtml = `<div class="specstrip">${strip.map(x => { const mm = /^(\d[\d,]*)(\s?.*)$/.exec(String(x[2])); return `<div>${x[0]}<small>${esc(x[1])}</small><b>${mm ? `<span data-count="${mm[1].replace(/,/g, '')}">${esc(mm[1])}</span>${esc(mm[2])}` : esc(x[2])}</b></div>`; }).join('')}</div>`;
  const variants = (m.variants || []).map(v => `<tr><th scope="row">${esc(v.name)}<small>${esc(v.fuel)} · ${esc(v.transmission)}</small></th><td>${esc(inr(v.ex_showroom))}</td><td><details><summary>${esc(t('features'))}</summary><ul class="ticks">${(lang === 'hi' && v.features_hi && v.features_hi.length ? v.features_hi : v.features_en || []).map(f => `<li>${ICON.check}${esc(f)}</li>`).join('')}</ul></details></td></tr>`).join('');
  const specs = {}; (m.specs || []).forEach(s => { const g = L(s, 'group', lang); (specs[g] = specs[g] || []).push(s); });
  const specHtml = Object.keys(specs).map(g => `<div class="spec"><h3>${esc(g)}</h3><dl>${specs[g].map(s => `<div><dt>${esc(L(s, 'label', lang))}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl></div>`).join('');
  const hl = (m.highlights || []).map(h => `<div class="why reveal"><h3>${esc(L(h, 'title', lang))}</h3><p>${esc(L(h, 'body', lang))}</p></div>`).join('');
  const offers = (m.offers || []).map(o => `<article class="offer"><span class="badge">${esc(t('offers'))}</span><h3>${esc(L(o, 'title', lang))}</h3><p>${esc(L(o, 'body', lang))}</p></article>`).join('');
  const body = `${crumbsHtml([[t('new_cars'), '/new-cars'], [m.name, '/new-cars/' + m.slug]], t)}
<section class="pdp wrap"><div class="pdp-media"><div class="stage">${img(hero, m.name, { eager: true, cls: 'stage-img', w: heroI.w, h: heroI.h, sizes: '(min-width:960px) 55vw, 100vw' })}<img class="xf" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="${heroI.w}" height="${heroI.h}" style="opacity:0"></div>${sw && (!photoMode || colors.some(c => M.carColour(m.slug, c.name_en))) ? `<div class="swatches" role="group" aria-label="${esc(t('colours'))}">${sw}</div>` : (colors.length ? `<ul class="colchips" aria-label="${esc(t('colours_avail'))}">${colors.map(c => `<li><i style="--c:${esc(c.hex)}"></i>${esc(L(c, 'name', lang))}</li>`).join('')}</ul><p class="muted small">${esc(t('photo_note'))}</p>` : '')}${gal && !photoMode ? `<ul class="gal">${gal}</ul>` : ''}</div>
<div class="pdp-info"><p class="eyebrow-s">${esc(t(m.body_type) || m.body_type)} <button class="btn btn-sm btn-o save-b" type="button" data-save="${esc(m.slug)}" aria-pressed="false">${ICON.heart} ${esc(t('save'))}</button></p><h1 class="h1">${esc(m.name)}<span class="dot">.</span></h1><p class="lead">${esc(L(m, 'tagline', lang))}</p><p>${esc(L(m, 'description', lang))}</p>${stripHtml}
${(m.offers || []).length ? `<div class="ribbon"><span>${esc(t('offer_rb'))}</span>${esc(L(m.offers[0], 'title', lang))}</div>` : ''}<div class="pricebox" data-onroad data-slug="${esc(m.slug)}" data-model="${esc(m.id)}"><div class="pb-h"><h2>${esc(t('on_road'))}</h2></div>
<div class="pb-f"><div class="field"><label for="pb-city">${esc(t('city'))}</label><select id="pb-city" name="city">${cities.map(c => `<option value="${esc(c.slug)}"${c.slug === city ? ' selected' : ''}>${esc(L(c, 'name', lang))}</option>`).join('')}</select></div>
<div class="field"><label for="pb-var">${esc(t('variant'))}</label><select id="pb-var" name="variant">${(m.variants || []).map(v => `<option value="${esc(v.id)}">${esc(v.name)} · ${esc(v.fuel)} ${esc(v.transmission)}</option>`).join('')}</select></div></div>
<label class="chk sw-t"><input type="checkbox" id="pb-acc" name="accessories"><span>${esc(t('accessories'))}</span></label>
<div class="pb-total" aria-live="polite"><small>${esc(t('on_road'))}</small><strong class="price big" data-total>${price && !price.expired ? esc(inr(price.on_road)) : '—'}</strong></div>
<div class="pb-body" data-bk aria-live="polite">${C.breakup(price, t, lang)}</div></div>
<div class="cta-row"><a class="btn" href="/test-drive?model=${esc(m.slug)}">${esc(t('book_td'))} ${ICON.arrow}</a><a class="btn btn-o" href="#enquire">${esc(t('request_quote'))}</a></div></div></section>
${offers ? `<section class="sec tight"><div class="wrap"><h2 class="h2">${esc(t('offers'))}<span class="dot">.</span></h2><div class="grid g3">${offers}</div></div></section>` : ''}
${hl ? `<section class="sec sec-grey"><div class="wrap"><h2 class="h2">${esc(t('highlights'))}<span class="dot">.</span></h2><div class="grid g3">${hl}</div></div></section>` : ''}
<section class="sec"><div class="wrap"><h2 class="h2">${esc(t('variants'))}<span class="dot">.</span></h2><div class="tbl-w"><table class="tbl"><thead><tr><th>${esc(t('variant'))}</th><th>${esc(t('ex_showroom'))}</th><th>${esc(t('features'))}</th></tr></thead><tbody>${variants}</tbody></table></div></div></section>
<section class="sec sec-grey"><div class="wrap two"><div><h2 class="h2">${esc(t('emi_calc'))}<span class="dot">.</span></h2>${C.emiWidget(t, { price: price && !price.expired ? price.on_road : (v0 ? v0.ex_showroom : 0) })}</div><div id="enquire"><h2 class="h2">${esc(t('request_quote'))}<span class="dot">.</span></h2>${C.leadForm(t, { source: 'website', type: 'enquiry', modelId: m.id, variantId: '', id: 'm', btn: t('request_quote') })}</div></div></section>
${specHtml ? `<section class="sec"><div class="wrap"><h2 class="h2">${esc(t('specs'))}<span class="dot">.</span></h2><div class="specs">${specHtml}</div></div></section>` : ''}
<div class="pricebar" data-pricebar inert><div class="in"><span class="nm">${esc(m.name)}</span><span class="vr" data-vr></span><span class="pr"><small>${esc(t('on_road'))}</small><strong data-total>${price && !price.expired ? esc(inr(price.on_road)) : esc(lakh(m.from_price))}</strong></span><a class="btn btn-sm" href="/test-drive?model=${esc(m.slug)}">${esc(t('book_td'))} ${ICON.arrow}</a></div></div>
<div class="sticky-cta" role="region" aria-label="${esc(m.name)}"><div><small>${esc(t('on_road'))}</small><strong data-total>${price && !price.expired ? esc(inr(price.on_road)) : esc(lakh(m.from_price))}</strong></div><a class="btn" href="/test-drive?model=${esc(m.slug)}">${esc(t('book_td'))} ${ICON.arrow}</a></div>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: m.name, description: L(m, 'description', 'en') || L(m, 'tagline', 'en'), image: BASE() + hero, brand: { '@type': 'Brand', name: 'Brand X' }, category: m.body_type,
    offers: { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: m.from_price, offerCount: (m.variants || []).length, availability: 'https://schema.org/InStock', url: BASE() + '/new-cars/' + m.slug } };
  return ctx.html(page({ ctx, title: m.name + ' ' + t('on_road'), desc: `${m.name}: ${L(m, 'tagline', lang)} ${t('from')} ${lakh(m.from_price)} ${t('ex_showroom')}.`, body, ogImage: hero, ogType: 'product', jsonld: [ld, crumbsLd([['Home', '/'], [t('new_cars'), '/new-cars'], [m.name, '/new-cars/' + m.slug]])], css: ['/css/detail2.css'], scripts: ['/js/car.js', '/js/forms.js'], bodyClass: 'has-cta' }));
}

// ---------- USED ----------
function usedList(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang; const q = ctx.query;
  const pageN = Math.max(1, parseInt(q.page, 10) || 1); const pageSize = 12;
  const f = { model: q.model, fuel: q.fuel, transmission: q.transmission, maxPrice: q.maxPrice, minYear: q.minYear, maxKm: q.maxKm, owners: q.owners, sort: q.sort || 'new', page: pageN, pageSize };
  Object.keys(f).forEach(k => { if (f[k] === undefined || f[k] === '') delete f[k]; });
  const r = safe(() => svc.used.listUsed(f), { items: [], total: 0, facets: {} });
  const fc = r.facets || {}; const bm = C.bodyMap();
  const sel = (name, label, opts, cur) => `<div class="field"><label for="u-${name}">${esc(label)}</label><select id="u-${name}" name="${name}"><option value="">${esc(t('any'))}</option>${(opts || []).map(o => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select></div>`;
  const yr = fc.years || []; const years = []; if (yr.length === 2) for (let y = yr[1]; y >= yr[0]; y--) years.push(y);
  const filters = `<form class="filters" method="get" action="/used-cars" id="ufilters"><h2 class="sr">${esc(t('filters'))}</h2>
${sel('model', t('model'), fc.models, q.model)}${sel('fuel', t('fuel'), fc.fuels, q.fuel)}${sel('transmission', t('transmission'), ['Manual', 'Automatic'], q.transmission)}${sel('minYear', t('year') + ' (min)', years, q.minYear)}
${sel('maxPrice', t('max_price'), [500000, 800000, 1000000, 1500000, 2000000].map(p => [p, lakh(p)]), q.maxPrice)}${sel('maxKm', t('max_km'), [20000, 40000, 60000, 80000].map(p => [p, p.toLocaleString('en-IN')]), q.maxKm)}${sel('owners', t('owners'), [1, 2, 3], q.owners)}
<div class="cta-row"><button class="btn" type="submit">${esc(t('apply'))} ${ICON.arrow}</button><a class="btn btn-o" href="/used-cars">${esc(t('reset'))}</a></div><input type="hidden" name="sort" value="${esc(q.sort || 'new')}"></form>`;
  const sorts = [['new', 'sort_new'], ['price_asc', 'sort_price_asc'], ['price_desc', 'sort_price_desc'], ['km', 'sort_km']];
  const base = new URLSearchParams(); Object.keys(q).forEach(k => { if (k !== 'page' && k !== 'lang' && q[k] !== '') base.set(k, q[k]); });
  const pages = Math.max(1, Math.ceil((r.total || 0) / pageSize));
  const plink = (p) => { const b = new URLSearchParams(base); b.set('page', p); return '/used-cars?' + b.toString(); };
  let pag = ''; if (pages > 1) { pag = `<nav class="pag" aria-label="${esc(t('page'))}">${pageN > 1 ? `<a class="pill" rel="prev" href="${esc(plink(pageN - 1))}">${esc(t('prev'))}</a>` : ''}`; for (let p = 1; p <= pages; p++) pag += `<a class="pill${p === pageN ? ' on' : ''}" href="${esc(plink(p))}"${p === pageN ? ' aria-current="page"' : ''}>${p}</a>`; pag += `${pageN < pages ? `<a class="pill" rel="next" href="${esc(plink(pageN + 1))}">${esc(t('next'))}</a>` : ''}</nav>`; }
  const body = `${crumbsHtml([[t('used_cars'), '/used-cars']], t)}${C.hdr({ title: esc(t('used_cars')), sub: t('why2b') })}<section class="sec tight"><div class="wrap lay"><aside class="side"><button class="btn btn-o fl-t" type="button" data-filters aria-expanded="false">${esc(t('filters'))}</button>${filters}</aside>
<div><div class="bar"><p><strong>${esc(r.total || 0)}</strong> ${esc(t('results'))}</p><form method="get" action="/used-cars" class="sortf">${['model', 'fuel', 'transmission', 'minYear', 'maxPrice', 'maxKm', 'owners'].map(k => q[k] ? `<input type="hidden" name="${k}" value="${esc(q[k])}">` : '').join('')}<label for="u-sort" class="sr">${esc(t('sort'))}</label><select id="u-sort" name="sort" data-autosubmit>${sorts.map(s => `<option value="${s[0]}"${(q.sort || 'new') === s[0] ? ' selected' : ''}>${esc(t(s[1]))}</option>`).join('')}</select><noscript><button class="btn btn-sm">${esc(t('apply'))}</button></noscript></form></div>
${(r.items || []).length ? `<div class="grid g3">${r.items.map(u => C.usedCard(u, t, lang, bm)).join('')}</div>` : `<p class="empty">${esc(t('no_results'))}</p>`}${pag}</div></div></section>`;
  const canonQ = pageN > 1 ? '' : '';
  return ctx.html(page({ ctx, path: '/used-cars', title: t('used_cars') + (pageN > 1 ? ' - ' + t('page') + ' ' + pageN : ''), desc: t('why2b'), body, jsonld: [crumbsLd([['Home', '/'], [t('used_cars'), '/used-cars']])], scripts: ['/js/home.js', '/js/forms.js'] }));
}

function usedPage(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const u = svc.used.getUsed(ctx.params.slug);
  if (!u) return notFound(ctx);
  const bm = C.bodyMap();
  const photos = C.usedPhotos(u);
  const title = u.title || [u.year, u.model, u.variant].filter(Boolean).join(' ');
  const insp = u.inspection || { sections: [] };
  const inspHtml = (insp.sections || []).map(s => `<details class="insp"><summary>${esc(L(s, 'name', lang))} <svg class="mini-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15" pathLength="100"/><circle class="fg" cx="18" cy="18" r="15" pathLength="100" style="--v:${Math.round((s.items || []).filter(i => i.status === 'ok').length * 100 / Math.max(1, (s.items || []).length))}"/></svg><span class="muted">${(s.items || []).filter(i => i.status === 'ok').length}/${(s.items || []).length}</span></summary><ul>${(s.items || []).map(i => `<li class="${i.status === 'ok' ? 'ok' : 'warn'}"><span class="st">${esc(i.status === 'ok' ? t('inspection_pass') : t('inspection_attn'))}</span> ${esc(L(i, 'label', lang))}${(lang === 'hi' ? i.note_hi : (i.note_en || i.note)) ? ` <small class="muted">${esc(lang === 'hi' ? i.note_hi : (i.note_en || i.note))}</small>` : ''}</li>`).join('')}</ul></details>`).join('');
  const sold = u.status !== 'available';
  const facts = [[t('year'), u.year], [t('km'), Number(u.km || 0).toLocaleString('en-IN')], [t('fuel'), u.fuel], [t('transmission'), u.transmission], [t('owners'), u.owners], [t('reg'), u.reg_masked], [t('colours'), V.colourName(u.color, lang)], [t('city'), C.usedLocation(u, lang)]].filter(x => x[1] !== undefined && x[1] !== null && x[1] !== '');
  const model = safe(() => svc.catalog.getModel(String(u.model || '').toLowerCase().replace(/\s+/g, '-')), null);
  const body = `${crumbsHtml([[t('used_cars'), '/used-cars'], [title, '/used-cars/' + u.slug]], t)}
<section class="pdp wrap"><div class="pdp-media" data-nolb><div class="stage" style="cursor:default">${photos.length ? img(photos[0], title, { eager: true, cls: 'stage-img', w: 1200, h: 900, sizes: '(min-width:960px) 55vw, 100vw' }) : C.usedMedia(u, bm, t, { eager: true })}</div>${photos.length > 1 ? `<ul class="gal">${photos.slice(1).map((p, i) => `<li>${img(p, title + ' ' + (i + 2))}</li>`).join('')}</ul>` : ''}</div>
<div class="pdp-info"><p><span class="badge${sold ? ' badge-dark' : ''}">${esc(sold ? t(u.status) : t('verified'))}</span> <button class="btn btn-sm btn-o save-b" type="button" data-save="${esc(u.slug)}" aria-pressed="false">${ICON.heart} ${esc(t('save'))}</button></p><h1 class="h1">${esc(title)}<span class="dot">.</span></h1>
<div class="pb-total"><strong class="price big">${esc(inr(u.price))}</strong>${u.emi_from ? `<small>${esc(t('emi_from'))} ${esc(inr(u.emi_from))}${esc(t('per_month'))}</small>` : ''}</div>
<dl class="facts">${facts.map(f => `<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join('')}</dl>
${(u.warranty_en || u.warranty_hi) ? `<p class="note">${ICON.shield} <span><strong>${esc(t('warranty'))}:</strong> ${esc(L(u, 'warranty', lang))}</span></p>` : ''}
<div class="cta-row"><a class="btn" href="/test-drive${model ? '?model=' + esc(model.slug) : ''}">${esc(t('book_td'))} ${ICON.arrow}</a><button class="btn btn-o" type="button" data-open="reserve" aria-haspopup="dialog">${esc(t('reserve'))}</button></div></div></section>
${(insp.sections || []).length ? `<section class="sec sec-grey"><div class="wrap"><div class="sec-h"><h2 class="h2">${esc(t('inspection'))}<span class="dot">.</span></h2><div class="ring" data-score="${esc(insp.score || 0)}" role="img" aria-label="${esc(t('inspection_score'))}: ${esc(insp.score || 0)}/100"><svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true"><circle class="bg" cx="75" cy="75" r="65"/><circle class="fg" cx="75" cy="75" r="65"/></svg><b>${esc(insp.score || 0)}</b></div></div>${inspHtml}</div></section>` : ''}
<section class="sec"><div class="wrap two"><div><h2 class="h2">${esc(t('emi_calc'))}<span class="dot">.</span></h2>${C.emiWidget(t, { price: u.price })}</div><div><h2 class="h2">${esc(t('tl_t'))}<span class="dot">.</span></h2><ol class="tl2"><li><b>${esc(u.year)}</b><span>${esc(t('tl_reg'))}</span></li><li><b>${esc(u.owners)}</b><span>${esc(t('tl_own'))}</span></li><li><b>${esc(Number(u.km || 0).toLocaleString('en-IN'))} ${esc(t('km'))}</b><span>${esc(t('tl_km'))}</span></li>${insp.score ? `<li><b>${esc(insp.score)}/100</b><span>${esc(t('tl_ins'))}</span></li>` : ''}${u.location ? `<li><b>${esc(C.usedLocation(u, lang))}</b><span>${esc(t('tl_yard'))}</span></li>` : ''}</ol></div></div></section>
<dialog class="sheet" id="reserve" aria-labelledby="rs-t"><div class="sheet-in"><div class="sheet-h"><h2 id="rs-t" class="h3">${esc(t('reserve_t'))}</h2><button class="circ" type="button" data-close aria-label="${esc(t('sheet_close'))}">&times;</button></div><p class="muted">${esc(t('reserve_note'))}</p>${C.leadForm(t, { source: 'website', type: 'used', usedId: u.id, id: 'u', btn: t('reserve'), message: '' })}</div></div></section>
<div class="sticky-cta"><div><small>${esc(title)}</small><strong>${esc(inr(u.price))}</strong></div><button class="btn" type="button" data-open="reserve" aria-haspopup="dialog">${esc(t('reserve'))} ${ICON.arrow}</button></div>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Car', name: title, brand: { '@type': 'Brand', name: 'Brand X' }, model: u.model, vehicleModelDate: String(u.year), mileageFromOdometer: { '@type': 'QuantitativeValue', value: u.km, unitCode: 'KMT' }, fuelType: u.fuel, vehicleTransmission: u.transmission, color: u.color, image: photos.map(p => BASE() + p),
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: u.price, itemCondition: 'https://schema.org/UsedCondition', availability: u.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', url: BASE() + '/used-cars/' + u.slug } };
  return ctx.html(page({ ctx, title, desc: `${title}, ${Number(u.km || 0).toLocaleString('en-IN')} km, ${u.fuel}. ${inr(u.price)}. ${t('inspection')}.`, body, ogImage: photos[0], ogType: 'product', jsonld: [ld, crumbsLd([['Home', '/'], [t('used_cars'), '/used-cars'], [title, '/used-cars/' + u.slug]])], css: ['/css/detail2.css'], scripts: ['/js/car.js', '/js/forms.js'], bodyClass: 'has-cta' }));
}

// ---------- TEST DRIVE ----------
function testDrive(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const models = safe(() => svc.catalog.listModels(), []); const shows = safe(() => svc.sales.listShowrooms(), []);
  const pre = ctx.query.model;
  const stepNames = [t('td_s1'), t('td_s2'), t('td_s3'), t('td_s4')];
  const body = `${crumbsHtml([[t('td_title'), '/test-drive']], t)}${C.hdr({ title: esc(t('td_title')) })}<section class="sec tight"><div class="wrap narrow">
<form class="form stepper" data-td method="post" action="/forms/test-drive" novalidate>
<ol class="steps">${stepNames.map((s, i) => `<li${i === 0 ? ' class="on" aria-current="step"' : ''}><span>${i + 1}</span>${esc(s)}</li>`).join('')}</ol>
<div class="panel" data-step="1"><h2 class="h3">${esc(t('choose_model'))}</h2><div class="opts">${models.map((m, i) => `<label class="opt"><input type="radio" name="modelId" value="${esc(m.id)}" required${(pre ? m.slug === pre : false) ? ' checked' : ''}><span class="opt-in">${img(m.hero_image || imgUrl(m.slug, m.body_type), m.name)}<b>${esc(m.name)}</b></span></label>`).join('')}</div><p class="err" role="alert" hidden></p></div>
<div class="panel" data-step="2" hidden><h2 class="h3">${esc(t('choose_showroom'))}</h2><div class="opts list">${shows.map((s, i) => `<label class="opt"><input type="radio" name="showroomId" value="${esc(s.id)}" required><span class="opt-in"><b>${esc(L(s, 'name', lang))}</b><small>${esc(L(s, 'address', lang))}</small></span></label>`).join('')}</div><p class="err" role="alert" hidden></p></div>
<div class="panel" data-step="3" hidden><h2 class="h3">${esc(t('choose_date'))}</h2>${dateRail(t, lang, 14, 1)}
<h3 class="h4">${esc(t('choose_slot'))}</h3><div class="slots" data-slots role="radiogroup" aria-label="${esc(t('choose_slot'))}" aria-live="polite"></div><p class="err" role="alert" hidden></p></div>
<div class="panel" data-step="4" hidden><h2 class="h3">${esc(t('td_s4'))}</h2>${personFields(t)}${consentField(t, 'c-td')}<div class="form-msg" role="status" aria-live="polite"></div></div>
<div class="step-nav"><button type="button" class="btn btn-o" data-back hidden>${ICON.left} ${esc(t('back'))}</button><button type="button" class="btn" data-next>${esc(t('continue'))} ${ICON.arrow}</button><button type="submit" class="btn" data-submit hidden>${esc(t('confirm_booking'))} ${ICON.arrow}</button></div>
<input type="hidden" name="time"></form><div class="done" data-done hidden></div></div></section>`;
  return ctx.html(page({ ctx, title: t('td_title'), desc: t('td_title') + ' - Company A Motors', body, jsonld: [crumbsLd([['Home', '/'], [t('td_title'), '/test-drive']])], css: ['/css/book2.css'], scripts: ['/js/forms.js', '/js/book.js'] }));
}

function callbackBox(t) {
  return `<aside class="callback" id="callback"><h3 class="h3">${esc(t('callback_t'))}</h3><p>${esc(t('callback_b'))}</p><form class="form" data-cb method="post" action="/forms/callback" novalidate>${field(t, { name: 'name', label: t('name'), required: true, autocomplete: 'name', maxlength: 80, id: 'cb-name' })}${field(t, { name: 'phone', label: t('phone'), required: true, type: 'tel', autocomplete: 'tel-national', inputmode: 'numeric', maxlength: 16, id: 'cb-phone' })}${field(t, { name: 'reason', label: t('message'), type: 'textarea', rows: 2, id: 'cb-reason' })}${field(t, { name: 'preferred_time', label: t('time'), id: 'cb-time' })}${consentField(t, 'c-cb')}<div class="form-msg" role="status" aria-live="polite"></div><button class="btn btn-red" type="submit">${esc(t('callback_btn'))} ${ICON.arrow}</button></form></aside>`;
}
function servicePage(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const ws = safe(() => svc.sales.listWorkshops(), []); const models = safe(() => svc.catalog.listModels(), []);
  const types = [['periodic', 'st_periodic'], ['repair', 'st_repair'], ['bodyshop', 'st_bodyshop'], ['wash', 'st_wash']];
  const body = `${crumbsHtml([[t('sv_title'), '/service']], t)}${C.hdr({ title: esc(t('sv_title')) })}<section class="sec tight"><div class="wrap narrow">
<form class="form" data-sv method="post" action="/forms/service" novalidate>
<div class="field"><span class="lab">${esc(t('workshop'))} <i>*</i></span><div class="opts list">${ws.map(w => `<label class="opt"><input type="radio" name="workshopId" value="${esc(w.id)}" required><span class="opt-in"><b>${esc(L(w, 'name', lang))}</b><small>${esc(L(w, 'address', lang))}</small></span></label>`).join('')}</div><p class="err" role="alert" hidden></p></div>
${dateRail(t, lang, 14, 1)}
<div class="field"><span class="lab">${esc(t('choose_slot'))} <i>*</i></span><div class="slots" data-slots role="radiogroup" aria-label="${esc(t('choose_slot'))}" aria-live="polite"></div><p class="err" role="alert" hidden></p></div><input type="hidden" name="time">
${personFields(t)}${field(t, { name: 'regNo', label: t('reg_no'), required: true, maxlength: 14, value: '' })}
${field(t, { name: 'model', label: t('car_model'), type: 'select', required: true, options: models.map(m => [m.name, m.name]).concat([['Other', 'Other']]) })}
${field(t, { name: 'serviceType', label: t('service_type'), type: 'select', options: types.map(x => [x[0], t(x[1])]) })}
<label class="chk"><input type="checkbox" name="pickupDrop" value="1"><span>${esc(t('pickup'))}</span></label>
${field(t, { name: 'notes', label: t('message'), type: 'textarea' })}${consentField(t, 'c-sv')}<div class="form-msg" role="status" aria-live="polite"></div>
<button class="btn" type="submit">${esc(t('confirm_booking'))} ${ICON.arrow}</button></form><div class="done" data-done hidden></div>${callbackBox(t)}</div></section>`;
  return ctx.html(page({ ctx, title: t('sv_title'), desc: t('sv_title') + ' - Company A Motors', body, jsonld: [crumbsLd([['Home', '/'], [t('sv_title'), '/service']])], css: ['/css/book2.css'], scripts: ['/js/forms.js', '/js/book.js'] }));
}

function comparePage(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const slugs = String(ctx.query.m || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 3);
  const ms = slugs.map(sl => safe(() => svc.catalog.getModel(sl), null)).filter(Boolean);
  let inner;
  if (ms.length < 1) inner = `<p class="empty">${esc(t('compare_empty'))} <a class="btn btn-o" href="/new-cars">${esc(t('nav_new'))}</a></p>`;
  else {
    const labels = []; ms.forEach(m => (m.specs || []).forEach(x => { if (!labels.includes(x.label_en)) labels.push(x.label_en); }));
    const val = (m, lab) => { const x = (m.specs || []).find(z => z.label_en === lab); return x ? x.value : '-'; };
    const row = (lab, f) => `<tr><th scope="row">${esc(lab)}</th>${ms.map(m => `<td>${f(m)}</td>`).join('')}</tr>`;
    const rng = (m) => { const p = (m.variants || []).map(v => v.ex_showroom); return p.length ? esc(lakh(Math.min.apply(null, p))) + (p.length > 1 ? ' - ' + esc(lakh(Math.max.apply(null, p))) : '') : '-'; };
    inner = `<div class="tbl-w"><table class="cmp-t"><thead><tr><th></th>${ms.map(m => `<th scope="col"><a href="/new-cars/${esc(m.slug)}">${C.carHero(m, {})}<br><strong>${esc(m.name)}</strong></a></th>`).join('')}</tr></thead><tbody>${row(t('ex_showroom'), rng)}${row(t('spec_body'), m => esc(t(m.body_type)))}${row(t('fuel'), m => esc((m.fuel_types || []).join(', ')))}${row(t('transmission'), m => esc([...new Set((m.variants || []).map(v => v.transmission))].join(', ')))}${row(t('variants'), m => esc((m.variants || []).length))}${labels.map(lab => { const sx = ms.map(m => (m.specs || []).find(z => z.label_en === lab)).find(Boolean); return row(L(sx, 'label', lang), m => esc(val(m, lab))); }).join('')}${row('', m => `<a class="btn btn-sm" href="/test-drive?model=${esc(m.slug)}">${esc(t('book_td'))}</a>`)}</tbody></table></div>`;
  }
  const body = `${crumbsHtml([[t('compare_title'), '/compare']], t)}${C.hdr({ title: esc(t('compare_title')) })}<section class="sec tight"><div class="wrap">${inner}</div></section>`;
  return ctx.html(page({ ctx, path: '/compare', title: t('compare_title'), desc: t('st2b'), body, noindex: ms.length > 0, scripts: [] }));
}

function credits(ctx) {
  const t = ctxT(ctx); let list = [];
  try { list = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'public', 'img', 'credits.json'), 'utf8')); } catch (e) { list = []; }
  const rows = list.map(c => `<tr><td>${esc(c.file)}</td><td><a href="${esc(c.source)}" rel="noopener nofollow" target="_blank">${esc(c.title)}</a></td><td>${esc(c.author)}</td><td>${esc(c.license)}</td><td>${esc(c.modification || '')}</td></tr>`).join('');
  const body = `${crumbsHtml([[t('photo_credits'), '/credits']], t)}${C.hdr({ title: esc(t('photo_credits')), sub: t('credits_sub') })}<section class="sec tight"><div class="wrap"><div class="tbl-w"><table class="tbl dense"><thead><tr><th>File</th><th>Title</th><th>Author</th><th>Licence</th><th>Changes</th></tr></thead><tbody>${rows || '<tr><td colspan="5">-</td></tr>'}</tbody></table></div></div></section>`;
  return ctx.html(page({ ctx, title: t('photo_credits'), desc: t('credits_sub'), body, scripts: [] }));
}

function account(ctx) {
  const t = ctxT(ctx);
  const body = `${crumbsHtml([[t('account'), '/account']], t)}${C.hdr({ title: esc(t('account')) })}<section class="sec tight"><div class="wrap"><div id="acc">${'<div class="skel row"></div>'}</div><noscript><p>${esc(t('js_required'))}</p></noscript></div></section>`;
  return ctx.html(page({ ctx, title: t('account'), desc: t('account'), body, noindex: true, scripts: ['/js/forms.js', '/js/account.js'] }));
}

function emiPage(ctx) {
  const t = ctxT(ctx);
  const body = `${crumbsHtml([[t('emi_calc'), '/emi']], t)}${C.hdr({ title: esc(t('emi_calc')), sub: t('emi_note') })}<section class="sec tight"><div class="wrap two"><div>${C.emiWidget(t, { price: 1000000, editablePrice: true })}</div><div><h2 class="h3">${esc(t('get_finance'))}</h2>${C.leadForm(t, { source: 'finance', type: 'finance', id: 'f', btn: t('get_finance') })}</div></div></section>`;
  return ctx.html(page({ ctx, title: t('emi_calc'), desc: t('emi_note'), body, jsonld: [crumbsLd([['Home', '/'], [t('emi_calc'), '/emi']])], scripts: ['/js/forms.js'] }));
}

function tradeIn(ctx) {
  const t = ctxT(ctx);
  const extra = field(t, { name: 'ti_make', label: t('make'), required: true, value: '' }) + field(t, { name: 'ti_model', label: t('car_model'), required: true }) +
    `<div class="row2">${field(t, { name: 'ti_year', label: t('year'), type: 'number', required: true, min: 1995, max: new Date().getFullYear() })}${field(t, { name: 'ti_km', label: t('max_km').replace(/.*/, 'Km'), type: 'number', required: true, min: 0 })}</div>` + field(t, { name: 'ti_expectedPrice', label: t('expected_price'), type: 'number', min: 0 });
  const body = `${crumbsHtml([[t('nav_trade'), '/trade-in']], t)}${C.hdr({ title: esc(t('trade_title')), sub: t('trade_sub') })}<section class="sec tight"><div class="wrap narrow">${C.leadForm(t, { source: 'trade_in', type: 'trade_in', id: 't', extra, btn: t('submit') })}</div></section>`;
  return ctx.html(page({ ctx, title: t('trade_title'), desc: t('trade_sub'), body, jsonld: [crumbsLd([['Home', '/'], [t('nav_trade'), '/trade-in']])], scripts: ['/js/forms.js'] }));
}

function contact(ctx) {
  const t = ctxT(ctx); const lang = ctx.lang;
  const sh = safe(() => svc.sales.listShowrooms(), []); const ws = safe(() => svc.sales.listWorkshops(), []);
  const card = (s) => `<article class="loc reveal"><h3>${esc(L(s, 'name', lang))}</h3><p>${esc(L(s, 'address', lang))}</p>${s.hours ? `<p class="muted">${esc(t('hours'))}: ${esc(typeof s.hours === 'string' ? s.hours : JSON.stringify(s.hours))}</p>` : ''}<div class="cta-row">${s.phone ? `<a class="btn btn-sm" href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(t('call'))} ${esc(s.phone)}</a>` : ''}${s.lat ? `<a class="btn btn-sm btn-o" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${esc(s.lat)},${esc(s.lng)}">${esc(t('directions'))}</a>` : ''}</div></article>`;
  const body = `${crumbsHtml([[t('contact_title'), '/contact']], t)}${C.hdr({ title: esc(t('contact_title')) })}<section class="sec tight"><div class="wrap"><h2 class="h3">${esc(t('showrooms'))}</h2><div class="grid g3">${sh.map(card).join('')}</div><h2 class="h3 mt">${esc(t('workshops'))}</h2><div class="grid g3">${ws.map(card).join('')}</div></div></section>
<section class="sec sec-grey"><div class="wrap two"><div><h2 class="h2">${esc(t('enquiry'))}<span class="dot">.</span></h2>${C.leadForm(t, { source: 'website', type: 'enquiry', id: 'c' })}</div>${callbackBox(t)}</div></section>`;
  return ctx.html(page({ ctx, title: t('contact_title'), desc: t('contact_title') + ' - Company A Motors Lucknow', body, jsonld: [V.dealerLd(sh, lang), crumbsLd([['Home', '/'], [t('contact_title'), '/contact']])], scripts: ['/js/forms.js'] }));
}

function privacy(ctx) {
  const t = ctxT(ctx); const hi = ctx.lang === 'hi';
  const P = hi ? [
    ['हम कौन सा डेटा लेते हैं', 'नाम, मोबाइल नंबर, ईमेल (वैकल्पिक), पसंदीदा कार, शहर, और आपके द्वारा दी गई जानकारी (जैसे ट्रेड-इन कार का विवरण)। हम केवल आपकी सहमति से डेटा लेते हैं।'],
    ['उपयोग का उद्देश्य', 'आपके अनुरोध (टेस्ट ड्राइव, सर्विस, पूछताछ, फ़ाइनेंस) का जवाब देना, बुकिंग की पुष्टि करना और संबंधित फ़ॉलो-अप भेजना।'],
    ['सहमति और वापसी', 'हर फ़ॉर्म में सहमति बॉक्स पहले से चुना नहीं होता। आप कभी भी सहमति वापस ले सकते हैं: ऑप्ट-आउट पेज पर अपना नंबर दें।'],
    ['आपके अधिकार (DPDP अधिनियम 2023)', 'आप अपने डेटा की जानकारी, सुधार, मिटाने और शिकायत का अधिकार रखते हैं।'],
    ['भंडारण और साझेदारी', 'डेटा केवल Company A Motors और उसके सेवा-प्रदाताओं के साथ साझा होता है, बेचा नहीं जाता, और आवश्यक अवधि तक ही रखा जाता है।'],
    ['शिकायत अधिकारी', 'privacy@companya.example | लखनऊ, उत्तर प्रदेश']
  ] : [
    ['What we collect', 'Name, mobile number, optional email, the car and city you are interested in, and details you choose to share (such as trade-in car details). We collect data only with your consent.'],
    ['Why we use it', 'To respond to your request (test drive, service, enquiry, finance), confirm bookings and send related follow-ups by call, SMS or WhatsApp.'],
    ['Consent and withdrawal', 'Consent boxes on our forms are never pre-ticked. You can withdraw consent at any time on the opt-out page; we then stop all messages.'],
    ['Your rights (DPDP Act, 2023)', 'You may ask to access, correct or erase your data, nominate someone to exercise rights on your behalf, and complain to us or the Data Protection Board.'],
    ['Storage and sharing', 'Data is shared only with Company A Motors teams and service providers who help us serve you. It is not sold and is kept only as long as needed.'],
    ['Grievance officer', 'privacy@companya.example | Lucknow, Uttar Pradesh']
  ];
  const body = `${crumbsHtml([[t('privacy_title'), '/privacy']], t)}${C.hdr({ title: esc(t('privacy_title')) })}<section class="sec tight"><div class="wrap narrow prose">${P.map(p => `<h2 class="h3">${esc(p[0])}</h2><p>${esc(p[1])}</p>`).join('')}<p><a class="btn" href="/opt-out">${esc(t('optout_title'))} ${ICON.arrow}</a></p></div></section>`;
  return ctx.html(page({ ctx, title: t('privacy_title'), desc: P[0][1], body, jsonld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: t('privacy_title'), url: BASE() + '/privacy' }, crumbsLd([['Home', '/'], [t('privacy_title'), '/privacy']])], scripts: [] }));
}

function optOut(ctx) {
  const t = ctxT(ctx);
  const body = `${crumbsHtml([[t('optout_title'), '/opt-out']], t)}${C.hdr({ title: esc(t('optout_title')), sub: t('optout_sub') })}<section class="sec tight"><div class="wrap narrow"><form class="form" data-optout method="post" action="/forms/optout" novalidate>${field(t, { name: 'phone', label: t('phone'), type: 'tel', required: true, inputmode: 'numeric', autocomplete: 'tel-national' })}<div class="form-msg" role="status" aria-live="polite"></div><button class="btn" type="submit">${esc(t('optout_btn'))} ${ICON.arrow}</button></form></div></section>`;
  return ctx.html(page({ ctx, title: t('optout_title'), desc: t('optout_sub'), body, jsonld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: t('optout_title'), url: BASE() + '/opt-out' }, crumbsLd([['Home', '/'], [t('optout_title'), '/opt-out']])], scripts: ['/js/forms.js'] }));
}

function thanks(ctx, msg, extra) {
  const t = ctxT(ctx);
  const body = `<section class="sec"><div class="wrap narrow center"><h1 class="h1">${esc(t('thanks'))}<span class="dot">.</span></h1><p class="lead">${esc(msg || t('thanks_lead'))}</p>${extra || ''}<p><a class="btn" href="/">${esc(t('go_home'))} ${ICON.arrow}</a></p></div></section>`;
  return ctx.html(page({ ctx, title: t('thanks'), body, noindex: true }));
}

function notFound(ctx) {
  const t = ctxT(ctx);
  const body = `<section class="nf"><div class="ghost" aria-hidden="true">404</div><div class="wrap narrow"><p class="script">${esc(t('script_tag'))}</p><h1 class="h1 xl">${esc(t('nf_title'))}<span class="dot">.</span></h1><p class="lead" style="margin-inline:auto">${esc(t('nf_body'))}</p>${img(imgUrl('model-s', 'suv', '1c1c1f'), '', { w: 800, h: 400 })}<p><a class="btn" href="/">${esc(t('go_home'))} ${ICON.arrow}</a> <a class="btn btn-o" href="/new-cars">${esc(t('nav_new'))}</a></p></div></section>`;
  return ctx.html(page({ ctx, title: t('nf_title'), body, noindex: true }), 404);
}
function serverError(ctx) {
  const t = ctxT(ctx);
  const body = `<section class="sec"><div class="wrap narrow center"><p class="eyebrow-s">500</p><h1 class="h1">${esc(t('err_title'))}<span class="dot">.</span></h1><p class="lead">${esc(t('err_body'))}</p><p><a class="btn" href="/">${esc(t('go_home'))} ${ICON.arrow}</a></p></div></section>`;
  return ctx.html(page({ ctx, title: t('err_title'), body, noindex: true }), 500);
}

// ---------- plain-POST fallbacks ----------
function digits(p) { return String(p || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''); }
async function formLead(ctx) {
  const b = ctx.body || {}; const t = ctxT(ctx);
  if (!b.consent) return thanks(ctx, t('err_consent'));
  const ti = {}; Object.keys(b).forEach(k => { if (k.startsWith('ti_')) ti[k.slice(3)] = b[k]; });
  const payload = { source: b.source || 'website', type: b.type, name: b.name, phone: b.phone, email: b.email, message: b.message, consent: true, lang: ctx.lang, modelId: b.modelId || undefined, usedId: b.usedId || undefined, variantId: b.variantId || undefined, tradeIn: Object.keys(ti).length ? ti : undefined };
  try { const r = await svc.sales.createLead(payload); return thanks(ctx, null, r && r.assignee ? `<p>${esc(t('your_consultant'))}: <strong>${esc(r.assignee.name)}</strong></p>` : ''); } catch (e) { return thanks(ctx, (e && e.message) || t('error_generic')); }
}
async function formTD(ctx) {
  const b = ctx.body || {}; const t = ctxT(ctx);
  try { const r = await svc.sales.createTestDrive({ name: b.name, phone: b.phone, email: b.email, showroomId: b.showroomId, modelId: b.modelId, date: b.date, time: b.time, consent: !!b.consent, lang: ctx.lang }); return thanks(ctx, t('booking_done') + ': ' + b.date + ' ' + b.time); } catch (e) { return thanks(ctx, (e && e.message) || t('error_generic')); }
}
async function formService(ctx) {
  const b = ctx.body || {}; const t = ctxT(ctx);
  try { await svc.sales.createServiceBooking({ name: b.name, phone: b.phone, regNo: b.regNo, model: b.model, workshopId: b.workshopId, date: b.date, time: b.time, serviceType: b.serviceType, pickupDrop: !!b.pickupDrop, notes: b.notes, consent: !!b.consent, lang: ctx.lang }); return thanks(ctx, t('booking_done') + ': ' + b.date + ' ' + b.time); } catch (e) { return thanks(ctx, (e && e.message) || t('error_generic')); }
}
async function formCallback(ctx) {
  const b = ctx.body || {}; const t = ctxT(ctx);
  try { require('../services/callbacks').createCallback({ name: b.name, phone: b.phone, reason: b.reason, preferred_time: b.preferred_time, consent: !!b.consent, lang: ctx.lang }, { ip: ctx.ip }); return thanks(ctx, t('thanks_lead')); } catch (e) { return thanks(ctx, (e && e.message) || t('error_generic')); }
}
async function formOptOut(ctx) {
  const t = ctxT(ctx);
  try { svc.sales.optOut({ phone: digits((ctx.body || {}).phone) }); return thanks(ctx, t('optout_done')); } catch (e) { return thanks(ctx, (e && e.message) || t('error_generic')); }
}

// ---------- fragments & seo ----------
function onroadFragment(ctx) {
  const t = ctxT(ctx); const q = ctx.query;
  let p = null;
  try { p = svc.catalog.getOnRoadPrice(q.variant, q.city || 'lucknow', { accessories: q.accessories === '1' }); } catch (e) { p = null; }
  const total = p && !p.expired ? inr(p.on_road) : '—';
  ctx.json({ html: C.breakup(p, t, ctx.lang), total, raw: p && !p.expired ? p.on_road : null, expired: !!(p && p.expired) });
}

function sitemap(ctx) {
  const base = BASE(); let urls = [];
  const s = svc.seo;
  try { if (s && s.listAllUrls) urls = s.listAllUrls() || []; } catch (e) { urls = []; }
  urls = urls.map(u => typeof u === 'string' ? { loc: u } : { loc: u.loc || u.url || u.path, lastmod: u.lastmod || u.updated_at, changefreq: u.changefreq, priority: u.priority }).filter(u => u.loc);
  const have = new Set(urls.map(u => u.loc));
  ['/', '/new-cars', '/used-cars', '/test-drive', '/service', '/emi', '/trade-in', '/contact', '/privacy'].forEach(loc => { if (!have.has(loc)) urls.unshift({ loc }); });
  if (urls.length < 12) {
    safe(() => svc.catalog.listModels(), []).forEach(m => { if (!have.has('/new-cars/' + m.slug)) urls.push({ loc: '/new-cars/' + m.slug }); });
    safe(() => svc.used.listUsed({ pageSize: 200 }), { items: [] }).items.forEach(u => { if (!have.has('/used-cars/' + u.slug)) urls.push({ loc: '/used-cars/' + u.slug }); });
  }
  const abs = (l) => /^https?:/.test(l) ? l : base + l;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` + urls.map(u => `<url><loc>${esc(abs(u.loc))}</loc><xhtml:link rel="alternate" hreflang="en" href="${esc(abs(u.loc))}?lang=en"/><xhtml:link rel="alternate" hreflang="hi" href="${esc(abs(u.loc))}?lang=hi"/>${u.lastmod ? `<lastmod>${esc(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}${u.changefreq ? `<changefreq>${esc(u.changefreq)}</changefreq>` : ''}${u.priority ? `<priority>${esc(u.priority)}</priority>` : ''}</url>`).join('\n') + '\n</urlset>';
  ctx.text(xml, 200, 'application/xml; charset=utf-8');
}
function robots(ctx) {
  ctx.text(`User-agent: *\nAllow: /\nDisallow: /staff\nDisallow: /admin\nDisallow: /api\nDisallow: /forms\nDisallow: /ui\n\nSitemap: ${BASE()}/sitemap.xml\n`, 200, 'text/plain; charset=utf-8');
}
function carImage(ctx) {
  const { render, bodyTypeOf } = require('../views/carimg');
  const slug = String(ctx.params.file || '').replace(/\.svg$/i, '');
  let type = ctx.query.t;
  if (!type) { const bm = C.bodyMap(); type = bm[slug] || bodyTypeOf(/model-s/.test(slug) ? 'suv' : /model-c/.test(slug) ? 'sedan' : /model-v/.test(slug) ? 'mpv' : 'hatchback'); }
  ctx.setHeader('Cache-Control', 'public, max-age=86400');
  ctx.text(render(type, ctx.query.c), 200, 'image/svg+xml; charset=utf-8');
}

function wrap(fn) { return async (ctx) => { try { return await fn(ctx); } catch (e) { if (e && e.status && e.status < 500) throw e; console.error('[page]', ctx.req && ctx.req.url, e); return serverError(ctx); } }; }

module.exports = { register(router) {
  const g = (p, fn) => router.get(p, wrap(fn));
  g('/', (ctx) => require('./home').home(ctx)); g('/new-cars', newCars); g('/new-cars/:slug', modelPage); g('/used-cars', usedList); g('/used-cars/:slug', usedPage);
  g('/test-drive', testDrive); g('/service', servicePage); g('/emi', emiPage); g('/account', account); g('/credits', credits); g('/compare', comparePage); g('/trade-in', tradeIn); g('/contact', contact); g('/privacy', privacy); g('/opt-out', optOut);
  g('/sitemap.xml', sitemap); g('/robots.txt', robots); g('/img/car/:file', carImage); g('/ui/onroad', onroadFragment);
  router.post('/forms/lead', wrap(formLead)); router.post('/forms/test-drive', wrap(formTD)); router.post('/forms/service', wrap(formService)); router.post('/forms/optout', wrap(formOptOut)); router.post('/forms/callback', wrap(formCallback));
  router.notFound = wrap(notFound);
}, notFound, serverError, ctxT };
