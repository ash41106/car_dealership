'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const auth = require('./auth');

const BODY_LIMIT = 5 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.map': 'application/json', '.csv': 'text/csv; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

// ---- rate limiter (in-memory fixed window)
const buckets = new Map();
function rateLimit(key, limit, windowMs = 60000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n <= limit;
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); }, 60000).unref();

function parseCookies(h) {
  const out = {};
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len > BODY_LIMIT) { req.resume(); return reject({ status: 413, message: 'Request body too large (max 5 MB)' }); }
    const chunks = []; let size = 0, dead = false;
    req.on('data', c => {
      if (dead) return;
      size += c.length;
      if (size > BODY_LIMIT) { dead = true; chunks.length = 0; reject({ status: 413, message: 'Request body too large (max 5 MB)' }); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!dead) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function parseBody(raw, ct) {
  if (!raw) return {};
  if (/application\/json/i.test(ct)) {
    try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { throw { status: 400, message: 'Invalid JSON body' }; }
  }
  if (/application\/x-www-form-urlencoded/i.test(ct)) {
    const o = {};
    for (const [k, v] of new URLSearchParams(raw)) {
      if (k === '__proto__' || k === 'constructor') continue;
      if (k in o) o[k] = [].concat(o[k], v); else o[k] = v;
    }
    return o;
  }
  if (/text\/csv|text\/plain/i.test(ct)) return { csv: raw };
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

function compile(pattern) {
  const keys = [];
  const re = pattern.split('/').map(seg => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { re: new RegExp('^' + re + '/?$'), keys };
}

class Router {
  constructor(opts = {}) {
    this.routes = [];
    this.notFound = null;      // frontend may set: (ctx) => void
    this.errorPage = null;     // frontend may set: (ctx, err) => void for non-API errors
    this.staticDirs = [];      // [{prefix, dir, cache}]
    this.log = opts.log !== false && process.env.LOG !== '0';
    this.secureCookies = /^https:/i.test(process.env.BASE_URL || '');
    this.gzCache = new Map();
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) this[m] = (p, h) => this.add(m.toUpperCase(), p, h);
  }
  add(method, pattern, handler) { this.routes.push({ method, pattern, handler, ...compile(pattern) }); return this; }
  static(prefix, dir, cache) { this.staticDirs.push({ prefix, dir: path.resolve(dir), cache }); }

  match(method, pathname) {
    let pathHit = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) { pathHit = true; continue; }
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
      return { route: r, params };
    }
    return { route: null, pathHit };
  }

  clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {
      const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (x) return x;
    }
    return req.socket.remoteAddress || '0.0.0.0';
  }

  makeCtx(req, res, url) {
    const cookies = parseCookies(req.headers.cookie);
    const query = Object.fromEntries(url.searchParams);
    const setCookies = [];
    const extra = {};
    let lang = cookies.lang === 'hi' ? 'hi' : 'en';
    if (query.lang === 'hi' || query.lang === 'en') {
      lang = query.lang;
      setCookies.push(`lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }
    const self = this;
    const ctx = {
      req, res, params: {}, query, body: {}, user: null, lang, cookies, ip: this.clientIp(req), url,
      setHeader(k, v) { extra[k] = v; },
      setCookie(name, val, o = {}) {
        let s = `${name}=${encodeURIComponent(val)}; Path=${o.path || '/'}; SameSite=${o.sameSite || 'Lax'}`;
        if (o.httpOnly) s += '; HttpOnly';
        if (o.maxAge !== undefined) s += `; Max-Age=${o.maxAge}`;
        if (o.secure || (o.secure === undefined && self.secureCookies && o.httpOnly)) s += '; Secure';
        setCookies.push(s);
      },
      send(status, body, type, headers) { self.send(ctx, status, body, type, { ...extra, ...(headers || {}) }, setCookies); },
      json(obj, status = 200) { ctx.send(status, JSON.stringify(obj), 'application/json; charset=utf-8'); },
      html(str, status = 200) { ctx.send(status, str, 'text/html; charset=utf-8'); },
      text(str, status = 200, contentType = 'text/plain; charset=utf-8') { ctx.send(status, str, contentType); },
      redirect(loc, status = 302) { ctx.send(status, '', 'text/plain', { Location: loc }); },
    };
    return ctx;
  }

  send(ctx, status, body, type, headers = {}, setCookies = []) {
    const { req, res } = ctx;
    if (res.headersSent) return;
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? '' : String(body));
    const h = { ...SECURITY_HEADERS, 'Content-Type': type, Vary: 'Accept-Encoding, Cookie', ...headers };
    if (/^\/api\//.test(ctx.url.pathname) || /^\/(staff|admin)/.test(ctx.url.pathname)) h['Cache-Control'] = h['Cache-Control'] || 'no-store';
    if (this.secureCookies) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    if (setCookies.length) h['Set-Cookie'] = setCookies;
    if (status === 200 && req.method === 'GET' && !h.ETag && buf.length && !h['Cache-Control']) {
      h.ETag = 'W/"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
      h['Cache-Control'] = 'no-cache';
    }
    if (h.ETag && req.headers['if-none-match'] === h.ETag) { res.writeHead(304, h); return res.end(); }
    if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && !h['Content-Encoding']) {
      buf = zlib.gzipSync(buf, { level: 6 });
      h['Content-Encoding'] = 'gzip';
    }
    h['Content-Length'] = buf.length;
    res.writeHead(status, h);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  serveFile(ctx, file, cache) {
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const h = { ETag: etag, 'Cache-Control': cache || 'no-cache' };
    if (ctx.req.headers['if-none-match'] === etag) { ctx.res.writeHead(304, { ...SECURITY_HEADERS, ...h }); ctx.res.end(); return true; }
    let buf = fs.readFileSync(file);
    if (st.size > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(ctx.req.headers['accept-encoding'] || '')) {
      let gz = this.gzCache.get(file + etag);
      if (!gz) { gz = zlib.gzipSync(buf, { level: 9 }); if (this.gzCache.size > 500) this.gzCache.clear(); this.gzCache.set(file + etag, gz); }
      buf = gz; h['Content-Encoding'] = 'gzip';
    }
    ctx.send(200, buf, type, h);
    return true;
  }

  tryStatic(ctx) {
    if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') return false;
    let p;
    try { p = decodeURIComponent(ctx.url.pathname); } catch { return false; }
    if (p.includes('\0')) return false;
    for (const s of this.staticDirs) {
      if (s.prefix !== '/' && !p.startsWith(s.prefix + '/')) continue;
      const rel = s.prefix === '/' ? p : p.slice(s.prefix.length);
      const file = path.join(s.dir, path.normalize(rel));
      if (!file.startsWith(s.dir + path.sep)) continue;
      const long = /^\/(img|uploads|fonts)\//.test(p) ? 'public, max-age=2592000' : /^\/(css|js)\//.test(p) ? 'public, max-age=86400' : 'no-cache';
      if (p.startsWith('/uploads/')) ctx.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      if (this.serveFile(ctx, file, long)) return true;
    }
    return false;
  }

  async handle(req, res) {
    const t0 = Date.now();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end('Bad request'); }
    const ctx = this.makeCtx(req, res, url);
    const isApi = url.pathname.startsWith('/api/') || url.pathname === '/healthz';
    try {
      try { ctx.user = auth.userFromCookie(ctx.cookies); } catch { ctx.user = null; }
      const { route, params, pathHit } = this.match(req.method, url.pathname);
      if (route) {
        ctx.params = params;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          ctx.body = parseBody(await readBody(req), String(req.headers['content-type'] || ''));
        }
        await route.handler(ctx);
      } else if (!this.tryStatic(ctx)) {
        if (pathHit) throw { status: 405, message: 'Method not allowed' };
        if (isApi) throw { status: 404, message: 'Not found' };
        if (this.notFound) await this.notFound(ctx);
        else ctx.html('<!doctype html><meta charset="utf-8"><title>Not found</title><h1>404 - Page not found</h1><p><a href="/">Home</a></p>', 404);
      }
    } catch (err) {
      this.fail(ctx, err, isApi);
    }
    if (this.log) console.log(`${new Date().toISOString()} ${ctx.ip} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms${ctx.user ? ' u=' + ctx.user.id : ''}`);
  }

  fail(ctx, err, isApi) {
    const status = Number.isInteger(err && err.status) ? err.status : 500;
    if (status === 500) console.error('[error]', ctx.req.method, ctx.url.pathname, err && err.stack || err);
    if (ctx.res.headersSent) { try { ctx.res.end(); } catch {} return; }
    const message = status === 500 ? 'Internal server error' : (err.message || 'Error');
    if (isApi || /application\/json/.test(String(ctx.req.headers.accept || '')) && !/text\/html/.test(String(ctx.req.headers.accept || ''))) {
      const o = { error: message };
      if (err.errors) o.errors = err.errors;
      return ctx.json(o, status);
    }
    if (this.errorPage) { try { return this.errorPage(ctx, { status, message }); } catch {} }
    ctx.html(`<!doctype html><meta charset="utf-8"><title>Error ${status}</title><h1>${status}</h1><p>${message.replace(/[<>&]/g, '')}</p><p><a href="/">Home</a></p>`, status);
  }
}

module.exports = { Router, rateLimit, MIME, parseCookies };
