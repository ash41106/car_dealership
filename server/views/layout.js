'use strict';
const { make, client } = require('./i18n');

const BASE = () => (process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const inr = (n) => (n == null || n === '' || isNaN(n)) ? '' : '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
// lakh/crore follow the page language (Devanagari words under lang=hi). Rendering is synchronous per request, so a module-level current language is safe.
const WORDS = { en: { lakh: 'Lakh', cr: 'Cr' }, hi: { lakh: '\u0932\u093E\u0916', cr: '\u0915\u0930\u094B\u0921\u093C' } };
const cur = { lang: 'en' };
const lakh = (n, lang) => {
  n = Number(n); if (!n) return ''; const w = WORDS[lang || cur.lang] || WORDS.en;
  if (n >= 1e7) return '\u20B9' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' ' + w.cr;
  if (n >= 1e5) return '\u20B9' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' ' + w.lakh;
  return inr(n);
};
const L = (o, f, lang) => { if (!o) return ''; const v = o[f + '_' + lang]; return v != null && v !== '' ? v : (o[f + '_en'] != null ? o[f + '_en'] : (o[f] != null ? o[f] : '')); };
// JSON for safe embedding inside <script>
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const ICON = {
  fuel: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M14 9h2.500a1.500 1.500 0 0 1 1.500 1.500V16a1.500 1.500 0 0 0 3 0V8l-2.500-2.500M7 8h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="6" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 8v4h12V8M12 12v4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  seat: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.500" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.500" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="13" width="16" height="7" rx="1.500" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  bolt: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 3 5 13h6l-1 8 8-10h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  left: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  car: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 14l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4h-2v-1H5v1H3zM7 14h.01M17 14h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z M8.500 12l2.500 2.500 4.500-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.500" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function imgUrl(slug, bodyType, hexColor) {
  let u = '/img/car/' + encodeURIComponent(slug) + '.svg';
  const q = [];
  if (bodyType) q.push('t=' + encodeURIComponent(bodyType));
  if (hexColor) q.push('c=' + encodeURIComponent(String(hexColor).replace('#', '')));
  return u + (q.length ? '?' + q.join('&') : '');
}
// <img> with explicit size, lazy by default
function img(src, alt, o) {
  o = o || {};
  const M = require('./media'), v = M.variants(src);
  const loading = o.eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  const cls = o.cls ? ` class="${esc(o.cls)}"` : '';
  if (!v) return `<img src="${esc(src)}" alt="${esc(alt || '')}" width="${o.w || 800}" height="${o.h || 400}" ${loading}${cls}>`;
  const sizes = o.sizes || '(min-width:1100px) 340px, (min-width:600px) 45vw, 100vw';
  const mid = v.ws[Math.min(1, v.ws.length - 1)];
  return `<picture><source type="image/webp" srcset="${esc(M.vset(v, 'webp'))}" sizes="${esc(sizes)}"><img src="${esc(M.vurl(v, mid, 'jpg'))}" srcset="${esc(M.vset(v, 'jpg'))}" sizes="${esc(sizes)}" alt="${esc(alt || '')}" width="${v.w}" height="${v.h}" ${loading}${cls}></picture>`;
}

function preloadTag(p) { // p: {src, sizes}
  const M = require('./media'), v = M.variants(p.src);
  if (!v) return `<link rel="preload" as="image" href="${esc(p.src)}" fetchpriority="high">`;
  return `<link rel="preload" as="image" type="image/webp" imagesrcset="${esc(M.vset(v, 'webp'))}" imagesizes="${esc(p.sizes || '100vw')}" fetchpriority="high">`;
}
const COL_HI = { pearl: 'मोती', white: 'सफेद', black: 'काला', silver: 'सिल्वर', grey: 'ग्रे', gray: 'ग्रे', red: 'लाल', blue: 'नीला', brown: 'भूरा', orange: 'नारंगी', green: 'हरा', beige: 'बेज', maroon: 'मैरून', metallic: 'मेटैलिक', flame: 'फ्लेम', steel: 'स्टील', ocean: 'ओशन', golden: 'सुनहरा', gold: 'सुनहरा', yellow: 'पीला', midnight: 'मिडनाइट' };
function colourName(name, lang) { if (!name || lang !== 'hi') return name; return String(name).split(/\s+/).map(w => COL_HI[w.toLowerCase()] || w).join(' '); }
function langHref(ctx, target) {
  const u = new URL(ctx.req.url, 'http://x');
  u.searchParams.set('lang', target);
  return u.pathname + u.search;
}

// opts: {ctx,title,desc,path,body,scripts[],jsonld[],noindex,bodyClass,ogImage,hideCta,css[]}
function page(o) {
  const ctx = o.ctx; const lang = ctx.lang === 'hi' ? 'hi' : 'en'; const t = make(lang);
  const path = o.path || new URL(ctx.req.url, 'http://x').pathname;
  const canon = BASE() + path;
  const title = o.title ? `${o.title} | ${t('brand')}` : t('brand');
  const desc = o.desc || t('hero_sub');
  const og = o.ogImage ? (o.ogImage.startsWith('http') ? o.ogImage : BASE() + o.ogImage) : BASE() + (require('./media').has('img/og-default.jpg') ? '/img/og-default.jpg' : '/img/car/model-s.svg?t=suv&c=1c1c1f');
  const nav = [['/new-cars', 'nav_new'], ['/used-cars', 'nav_used'], ['/test-drive', 'nav_td'], ['/service', 'nav_service'], ['/emi', 'nav_emi'], ['/trade-in', 'nav_trade'], ['/contact', 'nav_contact']];
  const cur = (p) => path === p || path.startsWith(p + '/');
  const navHtml = nav.map(([p, k]) => `<a href="${p}"${cur(p) ? ' aria-current="page"' : ''}>${esc(t(k))}</a>`).join('');
  const other = lang === 'en' ? 'hi' : 'en';
  const ld = (o.jsonld || []).map(j => `<script type="application/ld+json">${jsonSafe(j)}</script>`).join('');
  const scripts = ['/js/app.js', '/js/fx.js', '/js/v2.js'].concat(o.scripts || []).map(s => `<script src="${s}?v=5" defer></script>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${o.noindex ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${esc(canon)}"><link rel="alternate" hreflang="en" href="${esc(canon)}?lang=en"><link rel="alternate" hreflang="hi" href="${esc(canon)}?lang=hi"><link rel="alternate" hreflang="x-default" href="${esc(canon)}">`}
<meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canon)}"><meta property="og:image" content="${esc(og)}"><meta property="og:locale" content="${lang === 'hi' ? 'hi_IN' : 'en_IN'}"><meta name="twitter:card" content="summary_large_image">
<script>(function(){if(!(window.CSS&&CSS.supports&&CSS.supports('view-transition-name:a')))return;addEventListener('pageswap',function(e){if(!e.viewTransition||!e.activation||!e.activation.entry)return;try{var p=new URL(e.activation.entry.url).pathname,a=document.querySelector('.card-img[href="'+p+'"]');if(a)a.style.viewTransitionName='car'}catch(x){}});addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var s=document.querySelector('.stage');if(s){s.style.viewTransitionName='car';e.viewTransition.finished.finally(function(){s.style.viewTransitionName=''})}})})();</script><meta name="theme-color" content="#0b0b0b"><link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
${o.preload ? preloadTag(o.preload) : ''}<link rel="stylesheet" href="/css/app.css?v=5"><link rel="preload" as="font" type="font/woff2" href="/fonts/inter-tight.woff2" crossorigin><link rel="preload" as="font" type="font/woff2" href="/fonts/instrument-serif-italic.woff2" crossorigin><link rel="stylesheet" href="/css/fx.css?v=5"><link rel="stylesheet" href="/css/v2.css?v=5">${lang === 'hi' ? '<style>@font-face{font-family:"Noto Sans Devanagari";src:url(/fonts/noto-devanagari.woff2) format("woff2");font-weight:400 700;font-display:swap;unicode-range:U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09}</style>' : ''}${(o.css || []).map(c => `<link rel="stylesheet" href="${c}?v=5">`).join('')}${ld}</head>
<body class="${esc(o.bodyClass || '')}"><div class="progress" id="progress" aria-hidden="true"></div>
<a class="skip" href="#main">${esc(t('skip'))}</a>
<header class="hdr" id="hdr"><div class="wrap hdr-in">
<a class="logo" href="/" aria-label="${esc(t('brand'))}"><span class="logo-mark">A</span><span class="logo-t">Company A <b>Motors</b></span></a>
<nav class="nav" id="nav" aria-label="Primary">${navHtml}</nav>
<div class="hdr-r"><a class="lang" href="${esc(langHref(ctx, other))}" hreflang="${other}" lang="${other}">${esc(t('lang_toggle'))}</a>
<a class="signin hide-m" href="/account">${esc(t('signin'))}</a><a class="btn btn-sm hide-m" href="/test-drive">${esc(t('book_td'))} ${ICON.arrow}</a>
<button class="burger" id="burger" aria-expanded="false" aria-controls="nav" aria-label="${esc(t('menu'))}"><span></span><span></span></button></div></div></header>
<main id="main">${o.body}</main>
<footer class="ftr"><div class="wrap">${footMaps(t, lang)}</div><div class="wrap ftr-in"><div><a class="logo" href="/"><span class="logo-mark">A</span><span class="logo-t">Company A <b>Motors</b></span></a><p>${esc(t('footer_tag'))}</p><p class="muted">${esc(t('footer_legal'))}</p></div>
<div><h3>${esc(t('new_cars'))}</h3><a href="/new-cars">${esc(t('nav_new'))}</a><a href="/used-cars">${esc(t('nav_used'))}</a><a href="/emi">${esc(t('nav_emi'))}</a><a href="/trade-in">${esc(t('nav_trade'))}</a></div>
<div><h3>${esc(t('contact_title'))}</h3><a href="/test-drive">${esc(t('nav_td'))}</a><a href="/service">${esc(t('nav_service'))}</a><a href="/contact">${esc(t('nav_contact'))}</a><a href="/staff/login">${esc(t('staff_login'))}</a></div>
<div><h3>${esc(t('privacy'))}</h3><a href="/privacy">${esc(t('privacy_title'))}</a><a href="/opt-out">${esc(t('optout_title'))}</a><a href="/credits">${esc(t('photo_credits'))}</a></div></div>
<div class="wrap ftr-b">&copy; ${new Date().getFullYear()} ${esc(t('brand'))}</div></footer>
<script>window.__I=${jsonSafe(client(lang))};window.__LANG=${jsonSafe(lang)};</script>${scripts}</body></html>`;
}

function footMaps(t, lang) {
  let sh = []; try { sh = require('../services/sales').listShowrooms(); } catch (e) { sh = []; }
  if (!sh.length) return '';
  return `<div class="maps">${sh.map(s => `<a class="mapc" href="${s.lat ? 'https://www.google.com/maps/search/?api=1&amp;query=' + esc(s.lat) + ',' + esc(s.lng) : '/contact'}" target="_blank" rel="noopener"><span class="pin" aria-hidden="true"></span><b>${esc(L(s, 'name', lang))}</b><small>${esc(L(s, 'address', lang))}</small></a>`).join('')}</div>`;
}
function crumbsLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: BASE() + it[1] })) };
}
function crumbsHtml(items, t) {
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${[[t('breadcrumb_home'), '/']].concat(items).map((it, i, a) => i < a.length - 1 ? `<li><a href="${it[1]}">${esc(it[0])}</a></li>` : `<li aria-current="page">${esc(it[0])}</li>`).join('')}</ol></nav>`;
}
function dealerLd(showrooms, lang) {
  return { '@context': 'https://schema.org', '@type': 'AutoDealer', name: 'Company A Motors', url: BASE(), image: BASE() + '/img/car/model-s.svg?t=suv', priceRange: '\u20B9\u20B9\u20B9',
    department: (showrooms || []).map(s => ({ '@type': 'AutoDealer', name: L(s, 'name', 'en'), telephone: s.phone, address: { '@type': 'PostalAddress', streetAddress: L(s, 'address', 'en'), addressLocality: 'Lucknow', addressCountry: 'IN' }, geo: s.lat ? { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } : undefined })) };
}

// consent block used on every personal-data form
function consentField(t, id) {
  id = id || 'consent';
  return `<div class="field consent"><label class="chk"><input type="checkbox" name="consent" id="${id}" value="1" required aria-describedby="${id}-e"><span>${esc(t('consent'))} <a href="/privacy" target="_blank" rel="noopener">${esc(t('privacy'))}</a>.</span></label><p class="err" id="${id}-e" role="alert" hidden></p></div>`;
}
function field(t, o) { // {name,label,type,required,value,pattern,autocomplete,hint,rows,options}
  const id = o.id || 'f-' + o.name; const req = o.required ? ' required' : '';
  let inp;
  if (o.type === 'textarea') inp = `<textarea id="${id}" name="${o.name}" rows="${o.rows || 3}"${req} aria-describedby="${id}-e">${esc(o.value || '')}</textarea>`;
  else if (o.type === 'select') inp = `<select id="${id}" name="${o.name}"${req} aria-describedby="${id}-e">${o.options.map(p => `<option value="${esc(p[0])}"${String(p[0]) === String(o.value) ? ' selected' : ''}>${esc(p[1])}</option>`).join('')}</select>`;
  else inp = `<input id="${id}" name="${o.name}" type="${o.type || 'text'}"${req} value="${esc(o.value || '')}"${o.autocomplete ? ` autocomplete="${o.autocomplete}"` : ''}${o.inputmode ? ` inputmode="${o.inputmode}"` : ''}${o.maxlength ? ` maxlength="${o.maxlength}"` : ''}${o.min ? ` min="${o.min}"` : ''}${o.max ? ` max="${o.max}"` : ''} aria-describedby="${id}-e">`;
  return `<div class="field"><label for="${id}">${esc(o.label)}${o.required ? ' <i aria-hidden="true">*</i>' : ''}</label>${inp}<p class="err" id="${id}-e" role="alert" hidden></p></div>`;
}
function personFields(t, v) {
  v = v || {};
  return field(t, { name: 'name', label: t('name'), required: true, autocomplete: 'name', maxlength: 80, value: v.name }) +
    field(t, { name: 'phone', label: t('phone'), required: true, type: 'tel', autocomplete: 'tel-national', inputmode: 'numeric', maxlength: 16, value: v.phone }) +
    field(t, { name: 'email', label: t('email'), type: 'email', autocomplete: 'email', value: v.email });
}
function heading(a, b) { return `<h2 class="h2" data-split>${esc(a)} <em>${esc(b)}</em><span class="dot">.</span></h2>`; }

module.exports = { setLang: (l) => { cur.lang = l === 'hi' ? 'hi' : 'en'; }, colourName, esc, inr, lakh, L, jsonSafe, ICON, imgUrl, img, page, crumbsLd, crumbsHtml, dealerLd, consentField, field, personFields, heading, BASE, make, langHref };
