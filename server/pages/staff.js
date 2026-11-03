'use strict';
// Staff + admin + exec pages. Permission-aware: nav shows only what the user may use; pages return a clean 403 otherwise.
const V = require('../views/layout');
const { esc, jsonSafe, ICON } = V;
const { svc } = require('./components');

// Fallback role -> permissions when the backend RBAC tables are unavailable.
const FALLBACK = {
  consultant: ['lead.read.own', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.stats', 'lead.ai', 'booking.read.showroom', 'booking.update'],
  lead_desk: ['lead.read.all', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.import', 'lead.stats', 'lead.ai', 'sla.monitor'],
  showroom_manager: ['lead.read.showroom', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.stats', 'lead.ai', 'sla.monitor', 'booking.read.showroom', 'booking.update'],
  service_advisor: ['booking.read.workshop', 'booking.update', 'callback.read', 'callback.update'],
  workshop_manager: ['booking.read.workshop', 'booking.update', 'callback.read', 'callback.update', 'workshop.manage'],
  used_manager: ['lead.read.used', 'lead.update', 'lead.reply', 'lead.stats', 'lead.ai', 'used.read', 'used.write', 'used.price_suggestion', 'upload'],
  content_editor: ['content.models', 'content.offers', 'content.banners', 'upload'],
  dealer_principal: ['lead.read.all', 'lead.stats', 'sla.monitor', 'booking.read.all', 'callback.read', 'used.read', 'admin.read', 'users.read', 'roles.read', 'dashboard.read', 'settings.read', 'audit.read', 'export.dms', 'exec.read'],
  admin: ['*']
};
function permsFor(user) {
  try {
    const A = require('../lib/auth');
    if (A.whoami) { const p = A.whoami(user).permissions; if (p && p.length) return p; }
  } catch (e) { /* fall through */ }
  try { const P = require('../lib/perms'); const s = P.permsOf(user.role); if (s && s.size) return [...s]; if (P.MATRIX[user.role]) return P.MATRIX[user.role].perms; } catch (e) { /* ignore */ }
  return FALLBACK[user.role] || [];
}
const has = (perms, need) => perms.includes('*') || (Array.isArray(need) ? need : [need]).some(n => perms.includes(n));

// path, label, icon-letter, required perms, group
const NAV = [
  ['/staff/leads', 'Lead inbox', ['lead.read.own', 'lead.read.showroom', 'lead.read.all', 'lead.read.used'], 'Sales'],
  ['/staff/desk', 'SLA desk', ['sla.monitor'], 'Sales'],
  ['/staff/import', 'Import leads', ['lead.import'], 'Sales'],
  ['/staff/bookings', 'Test drives', ['booking.read.showroom', 'booking.read.all'], 'Sales'],
  ['/staff/service', 'Service board', ['booking.read.workshop', 'callback.read'], 'Service'],
  ['/exec', 'Executive', ['exec.read'], 'Insights'],
  ['/admin', 'Dashboard', ['dashboard.read'], 'Insights'],
  ['/admin/used', 'Used stock', ['used.read'], 'Inventory'],
  ['/admin/models', 'Models', ['content.models', 'prices.write'], 'Content'],
  ['/admin/prices', 'Prices', ['prices.write'], 'Content'],
  ['/admin/offers', 'Offers', ['content.offers'], 'Content'],
  ['/admin/banners', 'Banners', ['content.banners'], 'Content'],
  ['/admin/showrooms', 'Locations', ['config.write'], 'Content'],
  ['/admin/users', 'Users', ['users.read', 'users.manage'], 'Admin'],
  ['/admin/roles', 'Roles', ['roles.read', 'roles.manage'], 'Admin'],
  ['/admin/audit', 'Audit log', ['audit.read', 'audit.read.used'], 'Admin']
];
const HOME = { consultant: '/staff/leads', showroom_manager: '/staff/leads', lead_desk: '/staff/desk', service_advisor: '/staff/service', workshop_manager: '/staff/service', used_manager: '/admin/used', content_editor: '/admin/banners', dealer_principal: '/exec', admin: '/admin' };
const homeFor = (u, perms) => { const h = HOME[u.role]; if (h) return h; const n = NAV.find(x => has(perms, x[2])); return n ? n[0] : '/staff/login'; };
const ROLE_LABEL = { admin: 'Administrator', consultant: 'Sales consultant', lead_desk: 'Lead desk', showroom_manager: 'Showroom manager', service_advisor: 'Service advisor', workshop_manager: 'Workshop manager', used_manager: 'Used-car manager', content_editor: 'Content editor', dealer_principal: 'Dealer principal' };

function shell(ctx, o) { // o:{title,path,body,scripts}
  const u = ctx.user, perms = ctx.perms || permsFor(u);
  const groups = {}; NAV.filter(n => has(perms, n[2])).forEach(n => { (groups[n[3]] = groups[n[3]] || []).push(n); });
  const side = Object.keys(groups).map(g => `<div class="sb-g"><h2>${esc(g)}</h2>${groups[g].map(n => `<a href="${n[0]}"${o.path === n[0] ? ' aria-current="page"' : ''}>${esc(n[1])}</a>`).join('')}</div>`).join('');
  const ro = !has(perms, ['lead.update', 'used.write', 'users.manage', 'prices.write', 'content.offers']) ? ' <span class="chip">read-only</span>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(o.title)} | Company A Motors staff</title><link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css?v=2"><link rel="stylesheet" href="/css/staff.css?v=2"></head>
<body class="staff"><a class="skip" href="#main">Skip to content</a>
<div class="s-app"><aside class="sb" id="sb" aria-label="Staff navigation"><a class="logo" href="${homeFor(u, perms)}"><span class="logo-mark">A</span><span class="logo-t">Staff <b>console</b></span></a><nav>${side}</nav>
<div class="sb-u"><strong>${esc(u.name)}</strong><small>${esc(ROLE_LABEL[u.role] || u.role)}${ro}</small><div class="cta-row"><a class="btn btn-sm btn-o" href="/" target="_blank" rel="noopener">Website</a><button class="btn btn-sm btn-o" id="logout" type="button">Sign out</button></div></div></aside>
<div class="s-col"><header class="s-top"><button class="circ" id="sb-t" type="button" aria-label="Menu" aria-controls="sb" aria-expanded="false">&#9776;</button><span class="s-ttl">${esc(o.title)}</span><span class="s-live" id="s-clock" aria-hidden="true"></span></header>
<main id="main" class="s-main">${o.body}</main></div></div><div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script>window.__U=${jsonSafe({ id: u.id, name: u.name, role: u.role, showroom_id: u.showroom_id, workshop_id: u.workshop_id, perms })};</script>
<script src="/js/staff.js?v=2"></script>${(o.scripts || []).map(s => `<script src="${s}?v=2" defer></script>`).join('')}</body></html>`;
}

function forbidden(ctx, perms) {
  const u = ctx.user;
  const body = `<div class="forbid"><p class="num-xl">403</p><h1>You do not have access to this page</h1><p class="muted">Your role (${esc(ROLE_LABEL[u.role] || u.role)}) does not include the permission this page needs. Ask an administrator if you think this is a mistake.</p><p><a class="btn" href="${homeFor(u, perms)}">Go to my home</a></p></div>`;
  return ctx.html(shell(ctx, { title: 'No access', path: '', body }), 403);
}
function gate(need, fn) {
  return async (ctx) => {
    if (!ctx.user) return ctx.redirect('/staff/login?next=' + encodeURIComponent(ctx.req.url), 302);
    if (ctx.user.must_change_password) return changePw(ctx);
    ctx.perms = permsFor(ctx.user);
    ctx.setHeader('Cache-Control', 'no-store');
    if (need && !has(ctx.perms, need)) return forbidden(ctx, ctx.perms);
    return fn(ctx);
  };
}
const can = (ctx, p) => has(ctx.perms || [], p);
const head = (t, sub) => `<div class="s-head"><h1>${esc(t)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>`;
const skel = (n) => Array.from({ length: n || 3 }, () => '<div class="skel row"></div>').join('');

function changePw(ctx) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Change password | Company A Motors</title><link rel="stylesheet" href="/css/app.css?v=2"><link rel="stylesheet" href="/css/staff.css?v=2"></head><body class="staff login"><main class="login-box"><h1>Set a new password</h1><p class="muted">Your administrator reset your password. Choose a new one to continue.</p>
<form class="form" id="cpf" novalidate><div class="field"><label for="cp0">Current (temporary) password</label><input id="cp0" name="current_password" type="password" autocomplete="current-password" required></div><div class="field"><label for="cp1">New password</label><input id="cp1" name="new_password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="cp1-e"><p class="err" id="cp1-e" role="alert" hidden></p></div><div class="form-msg" role="status" aria-live="polite"></div><button class="btn" type="submit">Change password</button></form><p><button class="btn btn-sm btn-o" id="logout" type="button">Sign out</button></p></main><script>window.__U={};</script><script src="/js/staff.js?v=2"></script></body></html>`;
  return ctx.html(body);
}
const DEMO = [
  ['Administrator', 'admin@companya.in', 'Admin@123'], ['Dealer principal (read-only)', 'principal@companya.in', 'Principal@123'], ['Lead desk', 'desk@companya.in', 'Desk@123'],
  ['Showroom manager', 'manager.gomti@companya.in', 'Manager@123'], ['Sales consultant', 'priya@companya.in', 'Sales@123'], ['Used-car manager', 'used@companya.in', 'Used@123'],
  ['Content editor', 'content@companya.in', 'Content@123'], ['Service advisor', 'service@companya.in', 'Service@123'], ['Workshop manager', 'wm.amausi@companya.in', 'Workshop@123']
];
function login(ctx) {
  if (ctx.user) return ctx.redirect(homeFor(ctx.user, permsFor(ctx.user)));
  const next = String(ctx.query.next || '');
  const demo = process.env.NODE_ENV === 'production' ? '' : `<details class="demo"><summary>Demo accounts</summary><p class="muted small">Non-production only. Click a row to fill the form.</p><table><thead><tr><th>Role</th><th>Email</th><th>Password</th></tr></thead><tbody>${DEMO.map(d => `<tr tabindex="0" role="button" data-fill="${esc(d[1])}|${esc(d[2])}"><td>${esc(d[0])}</td><td>${esc(d[1])}</td><td><code>${esc(d[2])}</code></td></tr>`).join('')}</tbody></table></details>`;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Staff login | Company A Motors</title><link rel="icon" href="/img/favicon.svg"><link rel="stylesheet" href="/css/app.css?v=2"><link rel="stylesheet" href="/css/staff.css?v=2"></head>
<body class="staff login"><main class="login-box"><a class="logo" href="/"><span class="logo-mark">A</span><span class="logo-t">Company A <b>Motors</b></span></a><h1>Staff sign in</h1>
<form class="form" id="lf" novalidate data-next="${esc(next.startsWith('/') && !next.startsWith('//') ? next : '')}">
<div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" required aria-describedby="em-e"><p class="err" id="em-e" role="alert" hidden></p></div>
<div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required aria-describedby="pw-e"><p class="err" id="pw-e" role="alert" hidden></p></div>
<div class="form-msg" role="status" aria-live="polite"></div><button class="btn" type="submit">Sign in ${ICON.arrow}</button></form>${demo}<p class="muted small"><a href="/">Back to website</a> &middot; <a href="/account">Customer sign in</a></p></main>
<script src="/js/staff.js?v=2"></script></body></html>`;
  ctx.setHeader('Cache-Control', 'no-store');
  return ctx.html(body);
}

function leads(ctx) {
  const shows = svc.sales.listShowrooms();
  const body = `${head('Lead inbox', 'Respond within 5 minutes. New leads are listed first.')}
<section class="kpis" id="kpis" aria-live="polite">${skel(4).replace(/row/g, 'kp')}</section>
<form class="fbar" id="fbar" role="search" aria-label="Filter leads">
<div class="field"><label for="f-q">Search</label><input id="f-q" name="q" type="search" placeholder="Name, phone, email"></div>
<div class="field"><label for="f-status">Status</label><select id="f-status" name="status"><option value="">All</option>${['new', 'contacted', 'test_drive', 'negotiation', 'won', 'lost'].map(s => `<option>${s}</option>`).join('')}</select></div>
<div class="field"><label for="f-source">Source</label><select id="f-source" name="source"><option value="">All</option>${['website', 'test_drive', 'trade_in', 'finance', 'used_enquiry', 'carwale', 'cardekho', 'portal', 'facebook', 'instagram', 'walk_in', 'callback'].map(s => `<option>${s}</option>`).join('')}</select></div>
<div class="field"><label for="f-showroom">Showroom</label><select id="f-showroom" name="showroom"><option value="">All</option>${shows.map(s => `<option value="${esc(s.id)}">${esc(s.name_en || s.name)}</option>`).join('')}</select></div>
<label class="chk"><input type="checkbox" name="mine" value="1"><span>Mine only</span></label><label class="chk"><input type="checkbox" name="breached" value="1"><span>SLA breached</span></label></form>
<div id="list" class="llist" aria-live="polite">${skel(3)}</div><nav class="pag" id="pager" aria-label="Pages"></nav>
<div class="scrim" id="scrim" hidden></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title" hidden tabindex="-1"><div class="dr-h"><h2 id="dr-title">Lead</h2><button class="circ" type="button" id="dr-close" aria-label="Close lead">&times;</button></div><div class="dr-b" id="dr-body"></div></aside>`;
  return ctx.html(shell(ctx, { title: 'Lead inbox', path: '/staff/leads', body, scripts: ['/js/leads.js'] }));
}
function desk(ctx) {
  const body = `${head('SLA desk', 'Live monitor. Unassigned, about to breach, and breached leads. Assign in one click.')}
<section class="kpis" id="kpis">${skel(4).replace(/row/g, 'kp')}</section>
<div class="cols3" id="cols"><section class="col"><h2>Unassigned <span class="chip" id="n-un">0</span></h2><div id="c-un" class="stack">${skel(1)}</div></section><section class="col warn"><h2>Breaching (&lt; 2 min) <span class="chip" id="n-br">0</span></h2><div id="c-br" class="stack"></div></section><section class="col bad"><h2>Breached <span class="chip" id="n-bd">0</span></h2><div id="c-bd" class="stack"></div></section></div>
<section class="panel-s"><div class="s-bar"><h2>Consultant load</h2>${can(ctx, 'lead.import') ? '<a class="btn btn-sm btn-o" href="/staff/import">Import CSV</a>' : ''}</div><div id="load">${skel(2)}</div></section>`;
  return ctx.html(shell(ctx, { title: 'SLA desk', path: '/staff/desk', body, scripts: ['/js/desk.js'] }));
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
  const all = can(ctx, ['booking.read.all']);
  const tabs = all ? [['test_drive', 'Test drives'], ['service', 'Service']] : [['test_drive', 'Test drives']];
  const body = `${head('Test-drive bookings', 'Update status as customers arrive. Slots free up when a booking is cancelled or marked no-show.')}
<div class="pills" id="btabs">${tabs.map((t, i) => `<button class="pill${i ? '' : ' on'}" type="button" data-type="${t[0]}">${t[1]}</button>`).join('')}<label class="bdate"><span class="sr">Date</span><input type="date" id="b-date"></label></div>
<div id="blist" aria-live="polite">${skel(1)}</div>`;
  return ctx.html(shell(ctx, { title: 'Test drives', path: '/staff/bookings', body, scripts: ['/js/bookings.js'] }));
}
function service(ctx) {
  const body = `${head('Service board', "Today's job cards by status, the call-back queue with SLA timers, and bay capacity.")}
<section class="panel-s"><div class="s-bar"><h2>Bay capacity today</h2><label class="bdate"><span class="sr">Date</span><input type="date" id="sv-date"></label></div><div id="bays">${skel(1)}</div></section>
<section><div class="s-bar"><h2>Job cards</h2><span class="muted small">Drag a card to another column, or use the buttons.</span></div><div class="board" id="board">${skel(1)}</div></section>
<section class="panel-s"><div class="s-bar"><h2>Call-back queue <span class="chip" id="n-cb">0</span></h2></div><div id="cbq" class="stack">${skel(1)}</div></section>`;
  return ctx.html(shell(ctx, { title: 'Service board', path: '/staff/service', body, scripts: ['/js/service.js'] }));
}
function exec(ctx) {
  const body = `${head('Executive dashboard', 'Read-only. Last 30 days unless stated.')}
<section class="kpis" id="kpis">${skel(5).replace(/row/g, 'kp')}</section>
<div class="two"><section class="panel-s"><h2>Leads and SLA, 30 days</h2><div id="ch-trend" class="svgc">${skel(1)}</div><div class="legend"><span><i class="l1"></i>Leads</span><span><i class="l2"></i>Breached</span><span><i class="l3"></i>Won</span></div></section><section class="panel-s"><h2>Sales funnel</h2><div id="funnel">${skel(1)}</div></section></div>
<div class="two"><section class="panel-s"><h2>Lead sources</h2><div id="sources">${skel(1)}</div></section><section class="panel-s"><h2>Showroom comparison</h2><div id="showrooms">${skel(1)}</div></section></div>
<div class="two"><section class="panel-s risk"><h2>Revenue at risk</h2><div id="risk">${skel(1)}</div></section><section class="panel-s"><h2>Workshop and used stock</h2><div id="ops">${skel(1)}</div></section></div>
<section class="panel-s"><h2>Consultant performance</h2><div id="cons" class="tbl-w">${skel(1)}</div></section>`;
  return ctx.html(shell(ctx, { title: 'Executive dashboard', path: '/exec', body, scripts: ['/js/exec.js'] }));
}
function adminDash(ctx) {
  const body = `${head('Dashboard', 'Live view of response speed, leads, test drives and workshop load.')}<section class="kpis" id="kpis">${skel(4).replace(/row/g, 'kp')}</section>
<div class="two"><section class="panel-s"><h2>Leads per day (14 days)</h2><div id="ch-leads" class="chart">${skel(1)}</div></section><section class="panel-s"><h2>Service utilisation today</h2><div id="ch-util">${skel(1)}</div></section></div>
<div class="two"><section class="panel-s"><h2>Leads by status</h2><div id="ch-status"></div></section><section class="panel-s"><h2>Reports</h2><form id="dms" class="form"><div class="field"><label for="dms-d">DMS daily export date</label><input type="date" id="dms-d"></div><a class="btn btn-o" id="dms-a" href="/api/admin/export/dms.csv">Download DMS CSV</a></form><h3>Recent changes</h3><div id="audit" class="muted">Loading</div></section></div>`;
  return ctx.html(shell(ctx, { title: 'Dashboard', path: '/admin', body, scripts: ['/js/admin-dash.js'] }));
}
const crudDialog = () => `<dialog id="ed" aria-labelledby="ed-t"><form method="dialog" class="form ed-f" id="ed-form" novalidate><h2 id="ed-t">Edit</h2><div id="ed-fields"></div><div class="form-msg" role="status" aria-live="polite"></div><div class="cta-row"><button class="btn" type="submit">Save</button><button class="btn btn-o" type="button" id="ed-cancel">Cancel</button></div></form></dialog>`;
// resources per page with permission needed per resource tab
const ADMIN_PAGES = {
  '/admin/models': { title: 'Models and variants', res: [['models', ['content.models']], ['variants', ['prices.write']]] },
  '/admin/offers': { title: 'Offers', res: [['offers', ['content.offers']]] },
  '/admin/banners': { title: 'Banners', res: [['banners', ['content.banners']]] },
  '/admin/showrooms': { title: 'Showrooms, workshops and cities', res: [['showrooms', ['config.write']], ['workshops', ['config.write']], ['cities', ['config.write']], ['demo-cars', ['config.write']]] }
};
function adminCrud(path) {
  const c = ADMIN_PAGES[path];
  return gate(c.res.map(r => r[1][0]), (ctx) => {
    const res = c.res.filter(r => can(ctx, r[1]));
    const body = `${head(c.title)}<div class="pills" id="rtabs" role="tablist">${res.map((r, i) => `<button class="pill${i ? '' : ' on'}" type="button" role="tab" data-res="${r[0]}" aria-selected="${i ? 'false' : 'true'}">${esc(r[0].replace('-', ' '))}</button>`).join('')}</div>
<div id="crud" data-resources="${esc(res.map(r => r[0]).join(','))}">${skel(1)}</div>${crudDialog()}`;
    return ctx.html(shell(ctx, { title: c.title, path, body, scripts: ['/js/admin-core.js', '/js/admin-crud.js'] }));
  });
}
function adminPrices(ctx) {
  const body = `${head('Prices and on-road rules', 'Rules per city, with an optional model override. Every price on the website comes from these tables.')}
<section class="panel-s calc"><h2>Live calculator preview</h2><div class="pb-f4"><div class="field"><label for="pc-var">Variant</label><select id="pc-var"></select></div><div class="field"><label for="pc-city">City</label><select id="pc-city"></select></div><label class="chk"><input type="checkbox" id="pc-acc"><span>Accessories</span></label></div><div id="pc-out" aria-live="polite" class="pc-out"><span class="muted">Choose a variant</span></div></section>
<div class="s-bar"><h2>Price rules</h2><button class="btn btn-sm" id="pr-add" type="button">Add rule</button></div><div class="tbl-w"><table class="tbl dense" id="pr-tbl"><thead></thead><tbody><tr><td>${skel(1)}</td></tr></tbody></table></div>
<p class="muted small">Edit a cell and press Enter or leave the field to save. Percent fields are % of ex-showroom. Valid-until controls the expiry fallback shown to buyers.</p>
<div class="s-bar"><h2>Variants ex-showroom</h2></div><div class="tbl-w"><table class="tbl dense" id="vr-tbl"><thead></thead><tbody></tbody></table></div>${crudDialog()}`;
  return ctx.html(shell(ctx, { title: 'Prices', path: '/admin/prices', body, scripts: ['/js/admin-core.js', '/js/admin-prices.js'] }));
}
function adminUsed(ctx) {
  const show = can(ctx, 'used.price_suggestion');
  const body = `${head('Used stock', 'Create cars, set final prices, edit the 100-point inspection, and manage status.')}
<div class="s-bar"><label class="chk"><input type="checkbox" id="u-showsold"><span>Show sold</span></label>${can(ctx, 'used.write') ? '<button class="btn btn-sm" id="u-add" type="button">Add car</button>' : ''}</div><div class="tbl-w"><table class="tbl dense" id="u-tbl"><thead><tr><th>Stock</th><th>Car</th><th>Year</th><th>Km</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody><tr><td colspan="7">${skel(1)}</td></tr></tbody></table></div>${crudDialog()}`;
  return ctx.html(shell(ctx, { title: 'Used stock', path: '/admin/used', body, scripts: ['/js/admin-core.js', '/js/admin-used.js'] }).replace('window.__U=', 'window.__CANSUGGEST=' + show + ';window.__U='));
}
function adminUsers(ctx) {
  const body = `${head('Users', 'Create and edit staff, set role and scope, reset passwords, revoke sessions and deactivate.')}
<div class="s-bar"><input id="us-q" type="search" placeholder="Search name or email" aria-label="Search users" style="max-width:280px">${can(ctx, 'users.manage') ? '<button class="btn btn-sm" id="us-add" type="button">Add user</button>' : '<span class="chip">read-only</span>'}</div><div class="tbl-w"><table class="tbl dense" id="us-tbl"><thead></thead><tbody><tr><td>${skel(1)}</td></tr></tbody></table></div>${crudDialog()}`;
  return ctx.html(shell(ctx, { title: 'Users', path: '/admin/users', body, scripts: ['/js/admin-core.js', '/js/admin-users.js'] }));
}
function adminRoles(ctx) {
  const body = `${head('Roles and permissions', 'Tick what each role may do. The administrator role always keeps every permission.')}<div id="matrix" class="tbl-w">${skel(2)}</div>`;
  return ctx.html(shell(ctx, { title: 'Roles', path: '/admin/roles', body, scripts: ['/js/admin-roles.js'] }));
}
function adminAudit(ctx) {
  const body = `${head('Audit log', 'Price, stock, user and permission changes.')}<div class="tbl-w"><table class="tbl dense" id="au-tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody><tr><td colspan="5">${skel(1)}</td></tr></tbody></table></div>`;
  return ctx.html(shell(ctx, { title: 'Audit log', path: '/admin/audit', body, scripts: ['/js/admin-audit.js'] }));
}

module.exports = { permsFor, register(router) {
  router.get('/staff/login', login);
  router.get('/staff', async ctx => ctx.redirect(ctx.user ? homeFor(ctx.user, permsFor(ctx.user)) : '/staff/login'));
  router.get('/staff/leads', gate(['lead.read.own', 'lead.read.showroom', 'lead.read.all', 'lead.read.used'], leads));
  router.get('/staff/desk', gate(['sla.monitor'], desk));
  router.get('/staff/import', gate(['lead.import'], importPage));
  router.get('/staff/bookings', gate(['booking.read.showroom', 'booking.read.all'], bookings));
  router.get('/staff/service', gate(['booking.read.workshop', 'callback.read'], service));
  router.get('/exec', gate(['exec.read'], exec));
  router.get('/admin', gate(['dashboard.read'], adminDash));
  Object.keys(ADMIN_PAGES).forEach(p => router.get(p, adminCrud(p)));
  router.get('/admin/prices', gate(['prices.write'], adminPrices));
  router.get('/admin/used', gate(['used.read'], adminUsed));
  router.get('/admin/users', gate(['users.read', 'users.manage'], adminUsers));
  router.get('/admin/roles', gate(['roles.read', 'roles.manage'], adminRoles));
  router.get('/admin/audit', gate(['audit.read', 'audit.read.used'], adminAudit));
} };
