'use strict';
/* Company A Motors server. Env: PORT, HOST, DB_PATH, SESSION_SECRET, BASE_URL, TRUST_PROXY, ANTHROPIC_API_KEY, LOG=0, AUTO_SEED=0, RATE_LIMIT_PUBLIC */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const db = require('./lib/db');
const { Router } = require('./lib/router');
const { q } = db;

function carSvg(slug, color, view) {
  const m = q.get('SELECT body_type FROM models WHERE slug = ?', slug);
  const body = m ? m.body_type : 'hatchback';
  const c = /^[0-9a-f]{3,6}$/i.test(color || '') ? '#' + color : '#b3122d';
  const roofs = {
    hatchback: 'M210 250 L280 175 Q295 165 320 165 L470 165 Q500 168 520 195 L560 250 Z',
    sedan: 'M200 250 L275 180 Q290 170 315 170 L440 170 Q470 172 495 200 L540 250 Z',
    suv: 'M190 250 L250 168 Q262 158 290 158 L520 158 Q545 160 565 190 L600 250 Z',
    mpv: 'M190 250 L245 165 Q258 155 285 155 L535 155 Q560 158 575 190 L610 250 Z',
  };
  const roof = roofs[body] || roofs.hatchback;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450" role="img" aria-label="${slug.replace(/[^a-z0-9-]/g, '')}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f5f2"/><stop offset="1" stop-color="#e3e1dc"/></linearGradient></defs>
<rect width="800" height="450" fill="url(#g)"/><ellipse cx="400" cy="335" rx="300" ry="18" fill="#000" opacity=".12"/>
<path d="${roof}" fill="${c}"/><path d="M130 250 Q130 215 170 212 L650 212 Q690 215 690 250 L690 300 L130 300 Z" fill="${c}"/>
<path d="${roof}" fill="#fff" opacity=".28" transform="translate(6 10) scale(.97)"/>
<rect x="130" y="285" width="560" height="22" fill="#000" opacity=".18"/>
<g fill="#111"><circle cx="230" cy="305" r="42"/><circle cx="590" cy="305" r="42"/></g><g fill="#ccc"><circle cx="230" cy="305" r="22"/><circle cx="590" cy="305" r="22"/></g></svg>`;
}

function createApp() {
  db.open();
  if (process.env.AUTO_SEED !== '0' && !db.q.get('SELECT 1 x FROM models LIMIT 1')) {
    require('./seed').seed();
  }
  const router = new Router();
  require('./api').register(router);
  const pagesIndex = path.join(__dirname, 'pages', 'index.js');
  if (fs.existsSync(pagesIndex)) require(pagesIndex).register(router);

  router.get('/img/car/:file', ctx => {
    const f = String(ctx.params.file);
    if (!f.endsWith('.svg')) return router.notFound ? router.notFound(ctx) : ctx.text('Not found', 404);
    const slug = f.slice(0, -4).replace(/[^a-z0-9-]/g, '');
    ctx.send(200, carSvg(slug, ctx.query.c, ctx.query.v), 'image/svg+xml', { 'Cache-Control': 'public, max-age=2592000' });
  });

  router.static('/uploads', path.join(db.dataDir(), 'uploads'));
  router.static('/', path.join(db.ROOT, 'public'));
  const server = http.createServer((req, res) => { router.handle(req, res).catch(e => { console.error(e); try { res.writeHead(500); res.end('Server error'); } catch {} }); });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, router, close: () => new Promise(r => server.close(() => { db.close(); r(); })) };
}

module.exports = { createApp };

if (require.main === module) {
  const app = createApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  app.server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Company A Motors listening on http://localhost:${port}`));
  const stop = () => { console.log('Shutting down...'); app.server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
}
