'use strict';
const { q } = require('../lib/db');
const { httpError, toInt, nowIso } = require('../lib/util');
const auth = require('../lib/auth');
const { rateLimit } = require('../lib/router');
const catalog = require('../services/catalog');
const used = require('../services/used');
const sales = require('../services/sales');
const leads = require('../services/leads');
const admin = require('../services/admin');
const ai = require('../services/ai');

const PUBLIC_LIMIT = () => parseInt(process.env.RATE_LIMIT_PUBLIC || '20', 10);

function register(router) {
  const { guard } = auth;

  /** Public POST: rate limited; urlencoded form posts with _next redirect (progressive enhancement). */
  const pub = fn => async ctx => {
    if (!rateLimit('pub|' + ctx.ip, PUBLIC_LIMIT())) throw httpError(429, 'Too many requests. Please wait a minute.');
    const isForm = /x-www-form-urlencoded/i.test(String(ctx.req.headers['content-type'] || ''));
    const next = isForm && typeof ctx.body._next === 'string' && /^\/[^/\\]/.test(ctx.body._next) ? ctx.body._next : null;
    try {
      const out = await fn(ctx);
      if (next) return ctx.redirect(next + (next.includes('?') ? '&' : '?') + 'ok=1', 303);
      return ctx.json(out, 201);
    } catch (e) {
      if (next && e.status && e.status < 500) return ctx.redirect(next + (next.includes('?') ? '&' : '?') + 'err=' + encodeURIComponent(e.message), 303);
      throw e;
    }
  };
  const ip = ctx => ctx.ip;

  router.get('/healthz', ctx => {
    q.get('SELECT 1 x');
    ctx.json({ ok: true, uptime: Math.round(process.uptime()), time: nowIso() });
  });

  // ---------------- public read
  router.get('/api/models', ctx => ctx.json(catalog.listModels()));
  router.get('/api/models/:slug', ctx => { const m = catalog.getModel(ctx.params.slug); if (!m) throw httpError(404, 'Model not found'); ctx.json(m); });
  router.get('/api/cities', ctx => ctx.json(catalog.listCities()));
  router.get('/api/offers', ctx => ctx.json(catalog.listOffers({ active: true })));
  router.get('/api/banners', ctx => ctx.json(catalog.listBanners()));
  router.get('/api/onroad', ctx => {
    if (!ctx.query.variant) throw httpError(400, 'variant is required');
    ctx.json(catalog.getOnRoadPrice(ctx.query.variant, ctx.query.city || 'lucknow', { accessories: ctx.query.accessories === '1' || ctx.query.accessories === 'true' }));
  });
  router.get('/api/emi', ctx => {
    const d = catalog.emiDefaults();
    const principal = Number(ctx.query.principal);
    ctx.json(catalog.emi({ principal, rate: ctx.query.rate !== undefined ? ctx.query.rate : d.rate, months: ctx.query.months !== undefined ? ctx.query.months : d.months, downPayment: ctx.query.downPayment || 0 }));
  });
  router.get('/api/used', ctx => ctx.json(used.listUsed(ctx.query)));
  router.get('/api/used/:id', ctx => { const u = used.getUsed(ctx.params.id); if (!u) throw httpError(404, 'Car not found'); ctx.json(u); });
  router.get('/api/showrooms', ctx => ctx.json(sales.listShowrooms()));
  router.get('/api/workshops', ctx => ctx.json(sales.listWorkshops()));
  router.get('/api/slots/test-drive', ctx => ctx.json(sales.listTestDriveSlots({ showroomId: ctx.query.showroom, modelId: ctx.query.model, date: ctx.query.date })));
  router.get('/api/slots/service', ctx => ctx.json(sales.listServiceSlots({ workshopId: ctx.query.workshop, date: ctx.query.date })));

  // ---------------- public write
  router.post('/api/test-drive', pub(ctx => { ctx.body.lang = ctx.body.lang || ctx.lang; return sales.createTestDrive(ctx.body, { ip: ip(ctx) }); }));
  router.post('/api/service', pub(ctx => { ctx.body.lang = ctx.body.lang || ctx.lang; return sales.createServiceBooking(ctx.body, { ip: ip(ctx) }); }));
  router.post('/api/leads', pub(ctx => {
    const b = { ...ctx.body, lang: ctx.body.lang || ctx.lang };
    if (!['website', 'test_drive', 'trade_in', 'finance', 'used_enquiry', 'callback', undefined].includes(b.source)) b.source = 'website';
    if (b.tradeIn === undefined && b['tradeIn.model']) b.tradeIn = { make: b['tradeIn.make'], model: b['tradeIn.model'], year: b['tradeIn.year'], km: b['tradeIn.km'], expectedPrice: b['tradeIn.expectedPrice'] };
    return sales.createLead(b, { ip: ip(ctx) });
  }));
  router.post('/api/opt-out', pub(ctx => sales.optOut(ctx.body)));

  // ---------------- auth
  router.post('/api/auth/login', async ctx => {
    if (!rateLimit('login|' + ctx.ip, 30)) throw httpError(429, 'Too many requests');
    const u = auth.login(ctx.body.email, ctx.body.password, ctx.ip);
    ctx.setCookie(auth.COOKIE, auth.makeToken(u.id), { httpOnly: true, maxAge: auth.TTL_MS / 1000 });
    ctx.json({ user: auth.publicUser(u) });
  });
  router.post('/api/auth/logout', ctx => { ctx.setCookie(auth.COOKIE, '', { httpOnly: true, maxAge: 0 }); ctx.json({ ok: true }); });
  router.get('/api/me', ctx => { if (!ctx.user) throw httpError(401, 'Not logged in'); ctx.json({ user: auth.publicUser(ctx.user) }); });

  // ---------------- staff
  const LEAD_ROLES = ['consultant', 'used_manager'];
  router.get('/api/staff/leads/stats', guard(LEAD_ROLES, ctx => ctx.json(leads.stats(ctx.user))));
  router.post('/api/staff/leads/import', guard(LEAD_ROLES, ctx => {
    if (ctx.user.role === 'used_manager') throw httpError(403, 'Not permitted for your role');
    ctx.json(leads.importCsv(ctx.user, { csv: ctx.body.csv, source: ctx.body.source || 'portal', dryRun: ctx.body.dryRun === undefined ? true : (ctx.body.dryRun === true || ctx.body.dryRun === 'true' || ctx.body.dryRun === 1) }, ctx.ip));
  }));
  router.get('/api/staff/leads', guard(LEAD_ROLES, ctx => ctx.json(leads.listLeads(ctx.user, ctx.query))));
  router.get('/api/staff/leads/:id', guard(LEAD_ROLES, ctx => ctx.json(leads.getLead(ctx.user, ctx.params.id))));
  router.patch('/api/staff/leads/:id', guard(LEAD_ROLES, ctx => ctx.json(leads.updateLead(ctx.user, ctx.params.id, ctx.body))));
  router.post('/api/staff/leads/:id/reassign', guard(LEAD_ROLES, ctx => ctx.json(leads.reassign(ctx.user, ctx.params.id, ctx.body))));
  router.post('/api/staff/leads/:id/ai', guard(LEAD_ROLES, async ctx => ctx.json(await leads.regenerateAi(ctx.user, ctx.params.id))));
  router.post('/api/staff/leads/:id/reply', guard(LEAD_ROLES, ctx => ctx.json(leads.reply(ctx.user, ctx.params.id, ctx.body))));
  router.get('/api/staff/consultants', guard(['consultant', 'used_manager'], ctx => ctx.json(leads.listConsultants())));
  router.get('/api/staff/bookings', guard(['consultant', 'service_advisor'], ctx => ctx.json(sales.listBookings(ctx.user, ctx.query))));
  router.patch('/api/staff/bookings/:id', guard(['consultant', 'service_advisor'], ctx => ctx.json(sales.updateBooking(ctx.user, ctx.params.id, ctx.body))));

  // ---------------- admin
  router.get('/api/admin/dashboard', guard(['admin'], ctx => ctx.json(admin.dashboard())));
  router.get('/api/admin/audit', guard(['admin', 'used_manager'], ctx => {
    const rows = admin.auditLog(ctx.query.limit);
    ctx.json(ctx.user.role === 'admin' ? rows : rows.filter(r => ['used', 'past-sales'].includes(r.entity)));
  }));
  router.get('/api/admin/settings', guard(['admin'], ctx => ctx.json(admin.getSettings())));
  router.put('/api/admin/settings', guard(['admin'], ctx => ctx.json(admin.putSettings(ctx.user, ctx.body))));
  router.get('/api/admin/export/dms.csv', guard(['admin'], ctx => {
    ctx.setHeader('Content-Disposition', `attachment; filename="dms-${ctx.query.date || 'today'}.csv"`);
    ctx.text(admin.dmsCsv(ctx.query.date || require('../lib/util').today()), 200, 'text/csv; charset=utf-8');
  }));
  router.post('/api/admin/upload', guard(['admin', 'used_manager'], ctx => ctx.json(admin.saveUpload(ctx.user, ctx.body), 201)));
  router.get('/api/admin/used/:id/suggestion', guard(['used_manager'], ctx => {
    const r = q.get('SELECT * FROM used_cars WHERE id = ?', toInt(ctx.params.id));
    if (!r) throw httpError(404, 'Not found');
    ctx.json(ai.suggestUsedPrice(r));
  }));
  for (const name of Object.keys(admin.ENTITIES)) {
    const roles = admin.ENTITIES[name].roles;
    const base = '/api/admin/' + name;
    router.get(base, guard(roles, ctx => ctx.json(admin.list(ctx.user, name))));
    router.post(base, guard(roles, ctx => ctx.json(admin.create(ctx.user, name, ctx.body), 201)));
    router.get(base + '/:id', guard(roles, ctx => ctx.json(admin.get(ctx.user, name, ctx.params.id))));
    router.put(base + '/:id', guard(roles, ctx => ctx.json(admin.update(ctx.user, name, ctx.params.id, ctx.body))));
    router.delete(base + '/:id', guard(roles, ctx => ctx.json(admin.remove(ctx.user, name, ctx.params.id))));
  }
}

module.exports = { register };
