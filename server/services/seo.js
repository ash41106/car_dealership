'use strict';
const { q } = require('../lib/db');

/** [{loc, lastmod}] for model pages and used-car pages (available/booked). */
function listAllUrls() {
  const out = [];
  for (const m of q.all('SELECT slug, updated_at FROM models WHERE active = 1 ORDER BY sort, id')) {
    out.push({ loc: `/new-cars/${m.slug}`, lastmod: (m.updated_at || new Date().toISOString()).slice(0, 10) });
  }
  for (const u of q.all("SELECT slug, updated_at FROM used_cars WHERE status IN ('available','booked') ORDER BY id")) {
    out.push({ loc: `/used-cars/${u.slug}`, lastmod: (u.updated_at || new Date().toISOString()).slice(0, 10) });
  }
  return out;
}
module.exports = { listAllUrls };
