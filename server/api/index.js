'use strict';
/** All /api routes. Every route declares its permission (handler.perm): 'public' | 'authenticated' | 'perm.name' | [any-of]. */
const { q } = require('../lib/db');
const { httpError, toInt, today } = require('../lib/util');
const auth = require('../lib/auth');
const perms = require('../lib/perms');
const { rateLimit } = require('../lib/router');
const catalog = require('../services/catalog');
const used = require('../services/used');
const sales = require('../services/sales');
const leads = require('../services/leads');
const admin = require('../services/admin');
const ai = require('../services/ai');
const customers = require('../services/customers');
const callbacks = require('../services/callbacks');
const exec = require('../services/exec');

const PUBLIC_LIMIT = () => parseInt(process.env.RATE_LIMIT_PUBLIC || '20', 10);
const safeNext = v => (typeof v === 'string' && /^\/(?!\/)[A-Za-z0-9\-._~\/?=&%#+:,]{0,200}$/.test(v) && !/%0[ad]/i.test(v) ? v : null);

function register(router) {
  const { guard, open } = auth;
  const G = (perm, fn, o) => guard(perm, fn, o);

  /** Public POST: rate limited; urlencoded form posts with a safe _next get a 303 redirect (progressive enhancement). */
  const pub = fn => open(async ctx => {
    if (!rateLimit('pub|' + ctx.ip, PUBLIC_LIMIT())) throw httpError(429, 'Too many requests. Please wait a minute.');
    const isForm = /x-www-form-urlencoded/i.test(String(ctx.req.headers['content-type'] || ''));
    const next = isForm ? safeNext(ctx.body._next) : null;
    if (ctx.customer) { ctx.body.name = ctx.body.name || ctx.customer.name; ctx.body.phone = ctx.body.phone || ctx.customer.phone; }
    try {
      const out = await fn(ctx);
      if (next) return ctx.redirect(next + (next.includes('?') ? '&' : '?') + 'ok=1', 303);
      return ctx.json(out, 201);
    } catch (e) {
      if (next && e.status && e.status < 500) return ctx.redirect(next + (next.includes('?') ? '&' : '?') + 'err=' + encodeURIComponent(String(e.message).replace(/[\r\n]/g, ' ')), 303);
      throw e;
    }
  });
  const ip = ctx => ctx.ip;
  const sessionCookie = (ctx, name, token, maxAge) => ctx.setCookie(name, token, { httpOnly: true, maxAge });

  router.get('/healthz', open(ctx => { q.get('SELECT 1 x'); ctx.json({ ok: true, uptime: Math.round(process.uptime()), time: new Date().toISOString() }); }));

  // ---------------- public read
  const R = (path, fn) => router.get(path, open(fn));
  R('/api/models', ctx => ctx.json(catalog.listModels()));
  R('/api/models/:slug', ctx => { const m = catalog.getModel(ctx.params.slug); if (!m) throw httpError(404, 'Model not found'); ctx.json(m); });
  R('/api/cities', ctx => ctx.json(catalog.listCities()));
  R('/api/offers', ctx => ctx.json(catalog.listOffers({ active: true })));
  R('/api/banners', ctx => ctx.json(catalog.listBanners()));
  R('/api/onroad', ctx => {
    if (!ctx.query.variant) throw httpError(400, 'variant is required');
    ctx.json(catalog.getOnRoadPrice(ctx.query.variant, ctx.query.city || 'lucknow', { accessories: ctx.query.accessories === '1' || ctx.query.accessories === 'true' }));
  });
  R('/api/emi', ctx => {
    const d = catalog.emiDefaults();
    ctx.json(catalog.emi({ principal: Number(ctx.query.principal), rate: ctx.query.rate !== undefined ? ctx.query.rate : d.rate, months: ctx.query.months !== undefined ? ctx.query.months : d.months, downPayment: ctx.query.downPayment || 0 }));
  });
  R('/api/used', ctx => ctx.json(used.listUsed(ctx.query, { staff: !!ctx.user })));
  R('/api/used/:id', ctx => { const u = used.getUsed(ctx.params.id); if (!u) throw httpError(404, 'Car not found'); ctx.json(u); });
  R('/api/settings/public', ctx => {
    const body = JSON.stringify(admin.publicSettings());
    ctx.setHeader('Cache-Control', 'public, max-age=300');
    ctx.setHeader('ETag', 'W/"' + require('node:crypto').createHash('sha1').update(body).digest('base64url').slice(0, 20) + '"');
    ctx.text(body, 200, 'application/json; charset=utf-8');
  });
  R('/api/showrooms',ctx => ctx.json(sales.listShowrooms()));
  R('/api/workshops', ctx => ctx.json(sales.listWorkshops()));
  R('/api/slots/test-drive', ctx => ctx.json(sales.listTestDriveSlots({ showroomId: ctx.query.showroom, modelId: ctx.query.model, date: ctx.query.date })));
  R('/api/slots/service', ctx => ctx.json(sales.listServiceSlots({ workshopId: ctx.query.workshop, date: ctx.query.date })));

  // ---------------- public write (auto-linked to the customer account when logged in)
  router.post('/api/test-drive', pub(ctx => {
    ctx.body.lang = ctx.body.lang || ctx.lang;
    const r = sales.createTestDrive(ctx.body, { ip: ip(ctx) });
    customers.link(ctx.customer, 'bookings', r.booking.id); customers.link(ctx.customer, 'leads', r.lead.id);
    return r;
  }));
  router.post('/api/service', pub(ctx => {
    ctx.body.lang = ctx.body.lang || ctx.lang;
    const r = sales.createServiceBooking(ctx.body, { ip: ip(ctx) });
    customers.link(ctx.customer, 'bookings', r.booking.id);
    return r;
  }));
  router.post('/api/service/callback', pub(ctx => {
    const r = callbacks.createCallback({ ...ctx.body, lang: ctx.body.lang || ctx.lang }, { ip: ip(ctx), customerId: ctx.customer && ctx.customer.id });
    return r;
  }));
  router.post('/api/leads', pub(ctx => {
    const b = { ...ctx.body, lang: ctx.body.lang || ctx.lang };
    if (!['website', 'test_drive', 'trade_in', 'finance', 'used_enquiry', 'callback', undefined].includes(b.source)) b.source = 'website';
    if (b.tradeIn === undefined && b['tradeIn.model']) b.tradeIn = { make: b['tradeIn.make'], model: b['tradeIn.model'], year: b['tradeIn.year'], km: b['tradeIn.km'], expectedPrice: b['tradeIn.expectedPrice'] };
    const r = sales.createLead(b, { ip: ip(ctx) });
    customers.link(ctx.customer, 'leads', r.lead.id);
    return r;
  }));
  router.post('/api/opt-out', pub(ctx => sales.optOut(ctx.body)));

  // ---------------- staff auth
  router.post('/api/auth/login', open(async ctx => {
    if (!rateLimit('login|' + ctx.ip, 30)) throw httpError(429, 'Too many requests');
    const u = auth.login(ctx.body.email, ctx.body.password, ctx.ip);
    auth.destroySession(ctx.cookies[auth.COOKIE]);
    sessionCookie(ctx, auth.COOKIE, auth.createSession('staff', u.id, u.role, ctx), 12 * 3600);
    delete u.password_hash;
    ctx.json(auth.whoami(u));
  }));
  router.post('/api/auth/logout', open(ctx => { auth.destroySession(ctx.cookies[auth.COOKIE]); sessionCookie(ctx, auth.COOKIE, '', 0); ctx.json({ ok: true }); }));
  router.get('/api/me', G('authenticated', ctx => ctx.json(auth.whoami(ctx.user)), { allowPasswordChange: true }));
  router.post('/api/auth/change-password', G('authenticated', ctx => {
    auth.changePassword(ctx.user, ctx.body.current_password ?? ctx.body.current, ctx.body.new_password ?? ctx.body.new, ctx.cookies[auth.COOKIE]);
    sessionCookie(ctx, auth.COOKIE, auth.createSession('staff', ctx.user.id, ctx.user.role, ctx), 12 * 3600);
    ctx.json({ ok: true, note: 'All other sessions were signed out.' });
  }, { allowPasswordChange: true }));
  router.post('/api/auth/revoke-all', G('authenticated', ctx => {
    auth.revokeUserSessions(ctx.user.id);
    admin.audit(ctx.user, 'revoke_all_sessions', 'auth', ctx.user.id, null);
    sessionCookie(ctx, auth.COOKIE, '', 0);
    ctx.json({ ok: true });
  }, { allowPasswordChange: true }));

  // ---------------- customer accounts (cookie `cs`, separate from staff)
  router.post('/api/customer/otp/request', pub0(async ctx => ctx.json(await customers.requestOtp({ phone: ctx.body.phone, lang: ctx.body.lang || ctx.lang }, ctx.ip))));
  router.post('/api/customer/otp/verify', pub0(ctx => {
    const r = customers.verifyOtp(ctx.body, ctx);
    auth.destroySession(ctx.cookies[auth.CUSTOMER_COOKIE]);
    sessionCookie(ctx, auth.CUSTOMER_COOKIE, r.token, 30 * 86400);
    ctx.json({ customer: r.customer });
  }));
  function pub0(fn) { return open(async ctx => { if (!rateLimit('cust|' + ctx.ip, Math.max(PUBLIC_LIMIT(), 30))) throw httpError(429, 'Too many requests'); return fn(ctx); }); }
  router.post('/api/customer/logout', open(ctx => { auth.destroySession(ctx.cookies[auth.CUSTOMER_COOKIE]); sessionCookie(ctx, auth.CUSTOMER_COOKIE, '', 0); ctx.json({ ok: true }); }));
  const C = fn => G('customer.self', fn);
  router.get('/api/customer/me', C(ctx => ctx.json({ customer: customers.me(ctx.customer), role: 'customer', permissions: [...perms.permsOf('customer')] })));
  router.patch('/api/customer/me', C(ctx => ctx.json({ customer: customers.updateMe(ctx.customer, ctx.body) })));
  router.get('/api/customer/bookings', C(ctx => ctx.json(customers.bookings(ctx.customer))));
  router.patch('/api/customer/bookings/:id', C(ctx => ctx.json(ctx.body.status === 'cancelled' ? customers.cancelBooking(ctx.customer, ctx.params.id) : customers.rescheduleBooking(ctx.customer, ctx.params.id, ctx.body))));
  router.post('/api/customer/bookings/:id/cancel', C(ctx => ctx.json(customers.cancelBooking(ctx.customer, ctx.params.id))));
  router.get('/api/customer/enquiries', C(ctx => ctx.json(customers.enquiries(ctx.customer))));
  router.get('/api/customer/service-history', C(ctx => ctx.json(customers.serviceHistory(ctx.customer))));
  router.get('/api/customer/vehicles', C(ctx => ctx.json(customers.listVehicles(ctx.customer))));
  router.post('/api/customer/vehicles', C(ctx => ctx.json(customers.addVehicle(ctx.customer, ctx.body), 201)));
  router.put('/api/customer/vehicles/:id', C(ctx => ctx.json(customers.updateVehicle(ctx.customer, ctx.params.id, ctx.body))));
  router.patch('/api/customer/vehicles/:id', C(ctx => ctx.json(customers.updateVehicle(ctx.customer, ctx.params.id, ctx.body))));
  router.delete('/api/customer/vehicles/:id', C(ctx => ctx.json(customers.deleteVehicle(ctx.customer, ctx.params.id))));
  router.get('/api/customer/saved', C(ctx => ctx.json(customers.listSaved(ctx.customer))));
  router.post('/api/customer/saved', C(ctx => ctx.json(customers.saveCar(ctx.customer, ctx.body), 201)));
  router.delete('/api/customer/saved', C(ctx => ctx.json(customers.unsaveCar(ctx.customer, { ...ctx.query, ...ctx.body }))));
  router.post('/api/customer/data-request', C(ctx => ctx.json(customers.dataRequest(ctx.customer, ctx.body), 201)));
  router.get('/api/customer/export', C(ctx => {
    ctx.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    ctx.json(customers.exportData(ctx.customer));
  }));

  // ---------------- staff
  const LEAD_READ = ['lead.read.own', 'lead.read.showroom', 'lead.read.all', 'lead.read.used'];
  router.get('/api/staff/leads/stats', G('lead.stats', ctx => ctx.json(leads.stats(ctx.user))));
  router.post('/api/staff/leads/import', G('lead.import', ctx => {
    ctx.json(leads.importCsv(ctx.user, { csv: ctx.body.csv, source: ctx.body.source || 'portal', dryRun: ctx.body.dryRun === undefined ? true : (ctx.body.dryRun === true || ctx.body.dryRun === 'true' || ctx.body.dryRun === 1) }, ctx.ip));
  }));
  router.get('/api/staff/leads', G(LEAD_READ, ctx => ctx.json(leads.listLeads(ctx.user, ctx.query))));
  router.get('/api/staff/leads/:id', G(LEAD_READ, ctx => ctx.json(leads.getLead(ctx.user, ctx.params.id))));
  router.patch('/api/staff/leads/:id', G('lead.update', ctx => ctx.json(leads.updateLead(ctx.user, ctx.params.id, ctx.body))));
  router.post('/api/staff/leads/:id/reassign', G('lead.reassign', ctx => ctx.json(leads.reassign(ctx.user, ctx.params.id, ctx.body))));
  router.post('/api/staff/leads/:id/ai', G('lead.ai', async ctx => ctx.json(await leads.regenerateAi(ctx.user, ctx.params.id))));
  router.post('/api/staff/leads/:id/reply', G('lead.reply', ctx => ctx.json(leads.reply(ctx.user, ctx.params.id, ctx.body))));
  router.get('/api/staff/consultants', G(['lead.reassign', 'sla.monitor'], ctx => ctx.json(leads.listConsultants(ctx.user))));
  router.get('/api/staff/sla', G('sla.monitor', ctx => ctx.json(leads.slaMonitor(ctx.user))));
  router.get('/api/staff/bookings', G(['booking.read.showroom', 'booking.read.workshop', 'booking.read.all'], ctx => ctx.json(sales.listBookings(ctx.user, ctx.query))));
  router.patch('/api/staff/bookings/:id', G('booking.update', ctx => ctx.json(sales.updateBooking(ctx.user, ctx.params.id, ctx.body))));
  router.get('/api/staff/callbacks', G('callback.read', ctx => ctx.json(callbacks.list(ctx.user, ctx.query))));
  router.patch('/api/staff/callbacks/:id', G('callback.update', ctx => ctx.json(callbacks.update(ctx.user, ctx.params.id, ctx.body))));
  router.get('/api/staff/workshop', G('workshop.manage', ctx => ctx.json(sales.myWorkshop(ctx.user))));
  router.patch('/api/staff/workshop', G('workshop.manage', ctx => ctx.json(sales.updateMyWorkshop(ctx.user, ctx.body))));

  // ---------------- executive (read-only)
  router.get('/api/exec/summary', G('exec.read', ctx => ctx.json(exec.summary(ctx.query.days))));
  router.get('/api/exec/trend', G('exec.read', ctx => ctx.json(exec.trend(ctx.query.days))));

  // ---------------- admin
  router.get('/api/admin/dashboard', G('dashboard.read', ctx => ctx.json(admin.dashboard())));
  router.get('/api/admin/audit', G(['audit.read', 'audit.read.used'], ctx => ctx.json(admin.auditLog(ctx.user, ctx.query.limit))));
  router.get('/api/admin/settings', G('settings.read', ctx => ctx.json(admin.getSettings())));
  router.put('/api/admin/settings', G('settings.write', ctx => ctx.json(admin.putSettings(ctx.user, ctx.body))));
  router.get('/api/admin/export/dms.csv', G('export.dms', ctx => {
    ctx.setHeader('Content-Disposition', `attachment; filename="dms-${ctx.query.date || 'today'}.csv"`);
    ctx.text(admin.dmsCsv(ctx.query.date || today()), 200, 'text/csv; charset=utf-8');
  }));
  router.post('/api/admin/upload', G('upload', ctx => ctx.json(admin.saveUpload(ctx.user, ctx.body), 201)));
  router.get('/api/admin/used/:id/suggestion', G('used.price_suggestion', ctx => {
    const r = q.get('SELECT * FROM used_cars WHERE id = ?', toInt(ctx.params.id));
    if (!r) throw httpError(404, 'Not found');
    ctx.json(ai.suggestUsedPrice(r));
  }));
  router.get('/api/admin/roles', G('roles.read', ctx => ctx.json(admin.listRoles())));
  router.put('/api/admin/roles/:role/permissions', G('roles.manage', ctx => ctx.json(admin.setRolePermissions(ctx.user, ctx.params.role, ctx.body.permissions))));
  router.post('/api/admin/users/:id/reset-password', G('users.reset_password', ctx => ctx.json(admin.resetPassword(ctx.user, ctx.params.id))));
  router.get('/api/admin/data-requests', G('datareq.manage', ctx => ctx.json(customers.listDataRequests())));
  router.patch('/api/admin/data-requests/:id', G('datareq.manage', ctx => ctx.json(customers.resolveDataRequest(ctx.user, ctx.params.id, ctx.body))));
  for (const name of Object.keys(admin.ENTITIES)) {
    const cfg = admin.ENTITIES[name];
    const base = '/api/admin/' + name;
    router.get(base, G(cfg.read, ctx => ctx.json(admin.list(ctx.user, name))));
    router.post(base, G(cfg.write, ctx => ctx.json(admin.create(ctx.user, name, ctx.body), 201)));
    router.get(base + '/:id', G(cfg.read, ctx => ctx.json(admin.get(ctx.user, name, ctx.params.id))));
    router.put(base + '/:id', G(cfg.write, ctx => ctx.json(admin.update(ctx.user, name, ctx.params.id, ctx.body))));
    router.delete(base + '/:id', G(cfg.write, ctx => ctx.json(admin.remove(ctx.user, name, ctx.params.id))));
  }
}

module.exports = { register };
