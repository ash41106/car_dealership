'use strict';
const crypto = require('node:crypto');

function httpError(status, message, errors) {
  const e = new Error(message || 'Error');
  e.status = status;
  if (errors) e.errors = errors;
  return e;
}

/** Normalise an Indian mobile to 10 digits, or null when invalid. */
function normPhone(p) {
  if (p === undefined || p === null) return null;
  let d = String(p).replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  d = d.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function validEmail(e) {
  return typeof e === 'string' && e.length <= 120 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(e);
}

/** Strip control chars/tags-ish and trim. Output is still escaped by the frontend. */
function clean(s, max = 500) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim().slice(0, max);
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const IST_MS = 5.5 * 3600 * 1000;
/** Today's date in IST as YYYY-MM-DD. */
function today() { return new Date(Date.now() + IST_MS).toISOString().slice(0, 10); }
/** Current IST time HH:MM. */
function nowHM() { return new Date(Date.now() + IST_MS).toISOString().slice(11, 16); }
function nowIso() { return new Date().toISOString(); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z')); }
function isTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function randomId(n = 12) { return crypto.randomBytes(n).toString('hex'); }

/** "UP32AB1234" -> "UP32 •• ••34" (state + RTO code and last two digits only). */
function maskReg(reg) {
  const r = String(reg || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (r.length < 6) return '•• ••';
  return `${r.slice(0, 4)} •• ••${r.slice(-2)}`;
}

function normReg(reg) { return String(reg || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function validReg(reg) { return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(normReg(reg)); }

function parseJson(s, fallback) {
  if (s === null || s === undefined || s === '') return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

function toInt(v, d = 0) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
function toNum(v, d = null) { if (v === '' || v === null || v === undefined) return d; const n = Number(v); return Number.isFinite(n) ? n : d; }
function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' || v === 'yes'; }

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { httpError, normPhone, validEmail, clean, slugify, today, nowHM, nowIso, addDays, isDate, isTime, sha, randomId, maskReg, normReg, validReg, parseJson, toInt, toNum, truthy, escHtml };
