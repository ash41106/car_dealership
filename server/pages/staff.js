'use strict';
const V = require('../views/layout');
const { esc, jsonSafe, ICON } = V;
const { svc } = require('./components');

const NAV = [
  ['/staff/leads', 'Lead inbox', ['consultant', 'used_manager', 'admin']],
  ['/staff/import', 'Import leads', ['consultant', 'admin']],
  ['/staff/bookings', 'Bookings', ['consultant', 'service_advisor', 'admin']],
  ['/admin', 'Dashboard', ['admin']],
  ['/admin/models', 'Models', ['admin']],
  ['/admin/prices', 'Prices', ['admin']],
  ['/admin/used', 'Used stock', ['used_manager', 'admin']],
  ['/admin/offers', 'Offers', ['admin']],
  ['/admin/banners', 'Banners', ['admin']],
  ['/admin/showrooms', 'Showrooms', ['admin']],
  ['/admin/users', 'Users', ['admin']]
];
const HOME = { consultant: '/staff/leads', used_manager: '/admin/used', service_advisor: '/staff/bookings', admin: '/admin' };

function shell(ctx, o) { // o:{title,path,body,scripts,wide}
  const u = ctx.user;
  const links = NAV.filter(n => n[2].includes(u.role)).map(n => `<a href="${n[0]}"${o.path === n[0] ? ' aria-current="page"' : ''}>${esc(n[1])}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(o.title)} | Company A Motors staff</title><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css?v=1"><link rel="stylesheet" href="/css/staff.css?v=1"></head>
<body class="staff"><a class="skip" href="#main">Skip to content</a>
<header class="s-hdr"><div class="s-in"><a class="logo" href="${HOME[u.role] || '/'}"><span class="logo-mark">A</span><span class="logo-t">Staff <b>console</b></span></a>
<nav class="s-nav" aria-label="Staff">${links}</nav>
<div class="s-user"><span>${esc(u.name)} <small>${esc(u.role.replace('_', ' '))}</small></span><button class="btn btn-sm btn-o" id="logout" type="button">Sign out</button></div></div></header>
<main id="main" class="s-main">${o.body}</main><div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script>window.__U=${jsonSafe({ id: u.id, name: u.name, role: u.role, showroom_id: u.showroom_id })};</script>
<script src="/js/staff.js?v=1"></script>${(o.scripts || []).map(s => `<script src="${s}?v=1" defer></script>`).join('')}</body></html>`;
}

function gate(roles, fn) {
  return async (ctx) => {
    if (!ctx.user) return ctx.redirect('/staff/login?next=' + encodeURIComponent(ctx.req.url), 302);
    if (!roles.includes(ctx.user.role)) return ctx.redirect(HOME[ctx.user.role] || '/staff/login', 302);
    ctx.setHeader('Cache-Control', 'no-store');
    return fn(ctx);
  };
}
const head = (t, sub) => `<div class="s-head"><h1>${esc(t)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>`;

function login(ctx) {
  if (ctx.user) return ctx.redirect(HOME[ctx.user.role] || '/staff/leads');
  const next = String(ctx.query.next || '');
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Staff login | Company A Motors</title><link rel="icon" href="/img/favicon.svg"><link rel="stylesheet" href="/css/app.css?v=1"><link rel="stylesheet" href="/css/staff.css?v=1"></head>
<body class="staff login"><main class="login-box"><a class="logo" href="/"><span class="logo-mark">A</span><span class="logo-t">Company A <b>Motors</b></span></a><h1>Staff sign in</h1>
<form class="form" id="lf" novalidate data-next="${esc(next.startsWith('/') && !next.startsWith('//') ? next : '')}">
<div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" required aria-describedby="em-e"><p class="err" id="em-e" role="alert" hidden></p></div>
<div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required aria-describedby="pw-e"><p class="err" id="pw-e" role="alert" hidden></p></div>
<div class="form-msg" role="status" aria-live="polite"></div><button class="btn" type="submit">Sign in ${ICON.arrow}</button></form><p class="muted small"><a href="/">Back to website</a></p></main>
<script src="/js/staff.js?v=1"></script></body></html>`;
  ctx.setHeader('Cache-Control', 'no-store');
  return ctx.html(body);
}

function leads(ctx) {
  const u = ctx.user; const shows = svc.sales.listShowrooms();
  const body = `${head('Lead inbox', 'Respond within 5 minutes. New leads are listed first.')}
<section class="kpis" id="kpis" aria-live="polite"><div class="skel kp"></div><div class="skel kp"></div><div class="skel kp"></div><div class="skel kp"></div></section>
<form class="fbar" id="fbar" role="search" aria-label="Filter leads">
<div class="field"><label for="f-q">Search</label><input id="f-q" name="q" type="search" placeholder="Name, phone, email"></div>
<div class="field"><label for="f-status">Status</label><select id="f-status" name="status"><option value="">All</option>${['new', 'contacted', 'test_drive', 'negotiation', 'won', 'lost'].map(s => `<option>${s}</option>`).join('')}</select></div>
<div class="field"><label for="f-source">Source</label><select id="f-source" name="source"><option value="">All</option>${['website', 'test_drive', 'trade_in', 'finance', 'used_enquiry', 'carwale', 'cardekho', 'portal', 'facebook', 'instagram', 'walk_in', 'callback'].map(s => `<option>${s}</option>`).join('')}</select></div>
<div class="field"><label for="f-showroom">Showroom</label><select id="f-showroom" name="showroom"><option value="">All</option>${shows.map(s => `<option value="${esc(s.id)}">${esc(s.name_en || s.name)}</option>`).join('')}</select></div>
<label class="chk"><input type="checkbox" name="mine" value="1"><span>Mine only</span></label><label class="chk"><input type="checkbox" name="breached" value="1"><span>SLA breached</span></label></form>
<div id="list" class="llist" aria-live="polite"><div class="skel row"></div><div class="skel row"></div><div class="skel row"></div></div><nav class="pag" id="pager" aria-label="Pages"></nav>
<div class="scrim" id="scrim" hidden></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title" hidden tabindex="-1"><div class="dr-h"><h2 id="dr-title">Lead</h2><button class="circ" type="button" id="dr-close" aria-label="Close lead">&times;</button></div><div class="dr-b" id="dr-body"></div></aside>`;
  return ctx.html(shell(ctx, { title: 'Lead inbox', path: '/staff/leads', body, scripts: ['/js/leads.js'] }));
}

function importPage(ctx) {
  const body = `${head('Import leads', 'Upload a portal CSV (CarWale, CarDekho, ads). Headers like name, mobile, email, model, city, message are mapped automatically. Duplicates (same phone + model within 7 days) are skipped.')}
<section class="panel-s"><form id="imp" class="form" novalidate>
<div class="field"><label for="im-file">CSV file</label><input id="im-file" type="file" accept=".csv,text/csv"></div>
<div class="field"><label for="im-csv">Or paste CSV</label><textarea id="im-csv" rows="6" placeholder="name,mobile,model&#10;Asha,9876543210,Model S"></textarea></div>
<div class="field"><label for="im-src">Source</label><select id="im-src"><option value="carwale">CarWale</option><option value="cardekho">CarDekho</option><option value="portal">Other portal</option><option value="facebook">Facebook ads</option><option value="instagram">Instagram ads</option><option value="walk_in">Walk-in list</option></select></div>
<div class="form-msg" role="status" aria-live="polite"></div>
<div class="cta-row"><button class="btn btn-o" type="submit" data-act="dry">Preview (dry run)</button><button class="btn" type="button" id="im-go" disabled>Import now</button></div></form><div id="im-out"></div></section>`;
  return ctx.html(shell(ctx, { title: 'Import leads', path: '/staff/import', body, scripts: ['/js/import.js'] }));
}

function bookings(ctx) {
  const r = ctx.user.role;
  const tabs = r === 'service_advisor' ? [['service', 'Service']] : r === 'consultant' ? [['test_drive', 'Test drives']] : [['test_drive', 'Test drives'], ['service', 'Service']];
  const body = `${head('Bookings', 'Update status as customers arrive. Slots free up when a booking is cancelled or marked no-show.')}
<div class="pills" id="btabs">${tabs.map((t, i) => `<button class="pill${i ? '' : ' on'}" type="button" data-type="${t[0]}">${t[1]}</button>`).join('')}<label class="bdate"><span class="sr">Date</span><input type="date" id="b-date"></label></div>
<div id="blist" aria-live="polite"><div class="skel row"></div></div>`;
  return ctx.html(shell(ctx, { title: 'Bookings', path: '/staff/bookings', body, scripts: ['/js/bookings.js'] }));
}

// ---- admin ----
const ADMIN_PAGES = {
  '/admin/models': { title: 'Models and variants', res: ['models', 'variants'] },
  '/admin/offers': { title: 'Offers', res: ['offers'] },
  '/admin/banners': { title: 'Banners', res: ['banners'] },
  '/admin/showrooms': { title: 'Showrooms and workshops', res: ['showrooms', 'workshops', 'cities', 'demo-cars'] },
  '/admin/users': { title: 'Users', res: ['users'] }
};
function adminDash(ctx) {
  const body = `${head('Dashboard', 'Live view of response speed, leads, test drives and workshop load.')}<section class="kpis" id="kpis"><div class="skel kp"></div><div class="skel kp"></div><div class="skel kp"></div><div class="skel kp"></div></section>
<div class="two"><section class="panel-s"><h2>Leads per day (14 days)</h2><div id="ch-leads" class="chart"><div class="skel row"></div></div></section><section class="panel-s"><h2>Service utilisation today</h2><div id="ch-util"><div class="skel row"></div></div></section></div>
<div class="two"><section class="panel-s"><h2>Leads by status</h2><div id="ch-status"></div></section><section class="panel-s"><h2>Reports</h2><form id="dms" class="form"><div class="field"><label for="dms-d">DMS daily export date</label><input type="date" id="dms-d"></div><a class="btn btn-o" id="dms-a" href="/api/admin/export/dms.csv">Download DMS CSV</a></form><h3>Recent changes</h3><div id="audit" class="muted">Loading</div></section></div>`;
  return ctx.html(shell(ctx, { title: 'Dashboard', path: '/admin', body, scripts: ['/js/admin-dash.js'] }));
}
function adminCrud(path) {
  return gate(['admin'], (ctx) => {
    const c = ADMIN_PAGES[path];
    const body = `${head(c.title)}<div class="pills" id="rtabs" role="tablist">${c.res.map((r, i) => `<button class="pill${i ? '' : ' on'}" type="button" role="tab" data-res="${r}" aria-selected="${i ? 'false' : 'true'}">${esc(r.replace('-', ' '))}</button>`).join('')}</div>
<div id="crud" data-resources="${esc(c.res.join(','))}"><div class="skel row"></div></div>${crudDialog()}`;
    return ctx.html(shell(ctx, { title: c.title, path, body, scripts: ['/js/admin-core.js', '/js/admin-crud.js'] }));
  });
}
const crudDialog = () => `<dialog id="ed" aria-labelledby="ed-t"><form method="dialog" class="form ed-f" id="ed-form" novalidate><h2 id="ed-t">Edit</h2><div id="ed-fields"></div><div class="form-msg" role="status" aria-live="polite"></div><div class="cta-row"><button class="btn" type="submit">Save</button><button class="btn btn-o" type="button" id="ed-cancel">Cancel</button></div></form></dialog>`;

function adminPrices(ctx) {
  const body = `${head('Prices and on-road rules', 'Rules per city, with an optional model override. Every price on the website comes from these tables.')}
<section class="panel-s calc"><h2>Live calculator preview</h2><div class="pb-f4"><div class="field"><label for="pc-var">Variant</label><select id="pc-var"></select></div><div class="field"><label for="pc-city">City</label><select id="pc-city"></select></div><label class="chk"><input type="checkbox" id="pc-acc"><span>Accessories</span></label></div><div id="pc-out" aria-live="polite" class="pc-out"><span class="muted">Choose a variant</span></div></section>
<div class="s-bar"><h2>Price rules</h2><button class="btn btn-sm" id="pr-add" type="button">Add rule</button></div><div class="tbl-w"><table class="tbl dense" id="pr-tbl"><thead></thead><tbody><tr><td><div class="skel row"></div></td></tr></tbody></table></div>
<p class="muted small">Edit a cell and press Enter or leave the field to save. Percent fields are % of ex-showroom. Valid-until controls the expiry fallback shown to buyers.</p>
<div class="s-bar"><h2>Variants ex-showroom</h2></div><div class="tbl-w"><table class="tbl dense" id="vr-tbl"><thead></thead><tbody></tbody></table></div>${crudDialog()}`;
  return ctx.html(shell(ctx, { title: 'Prices', path: '/admin/prices', body, scripts: ['/js/admin-core.js', '/js/admin-prices.js'] }));
}
function adminUsed(ctx) {
  const show = ['used_manager', 'admin'].includes(ctx.user.role);
  const body = `${head('Used stock', 'Create cars, set final prices, edit the 100-point inspection, and manage status.')}
<div class="s-bar"><label class="chk"><input type="checkbox" id="u-showsold"><span>Show sold</span></label><button class="btn btn-sm" id="u-add" type="button">Add car</button></div><div class="tbl-w"><table class="tbl dense" id="u-tbl"><thead><tr><th>Stock</th><th>Car</th><th>Year</th><th>Km</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody><tr><td colspan="7"><div class="skel row"></div></td></tr></tbody></table></div>${crudDialog()}`;
  return ctx.html(shell(ctx, { title: 'Used stock', path: '/admin/used', body, scripts: ['/js/admin-core.js', '/js/admin-used.js'] }) .replace('window.__U=', 'window.__CANSUGGEST=' + show + ';window.__U='));
}

module.exports = { register(router) {
  router.get('/staff/login', login);
  router.get('/staff', ctx => ctx.redirect(ctx.user ? (HOME[ctx.user.role] || '/staff/leads') : '/staff/login'));
  router.get('/staff/leads', gate(['consultant', 'used_manager', 'admin'], leads));
  router.get('/staff/import', gate(['consultant', 'admin'], importPage));
  router.get('/staff/bookings', gate(['consultant', 'service_advisor', 'admin'], bookings));
  router.get('/admin', gate(['admin'], adminDash));
  Object.keys(ADMIN_PAGES).forEach(p => router.get(p, adminCrud(p)));
  router.get('/admin/prices', gate(['admin'], adminPrices));
  router.get('/admin/used', gate(['used_manager', 'admin'], adminUsed));
} };
