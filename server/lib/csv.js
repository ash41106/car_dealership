'use strict';
/** RFC-4180-ish CSV parser (quotes, escaped quotes, embedded newlines, CRLF/LF/CR, BOM, auto delimiter). */
function detectDelimiter(text) {
  const first = text.split(/\r\n|\n|\r/)[0] || '';
  let best = ',', bestN = -1;
  for (const d of [',', ';', '\t', '|']) {
    let n = 0, inQ = false;
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++; }
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}

function parseCsv(text, delimiter) {
  text = String(text || '').replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false, i = 0, any = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { inQ = true; any = true; i++; continue; }
    if (c === d) { row.push(field); field = ''; any = true; i++; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      row.push(field);
      if (any || row.length > 1 || row[0] !== '') rows.push(row);
      row = []; field = ''; any = false;
      continue;
    }
    field += c; any = true; i++;
  }
  if (inQ) { const e = new Error('Unterminated quoted field'); e.status = 400; throw e; }
  if (any || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

/** Escape one value for CSV output; neutralises spreadsheet formula injection. */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(headers, rows) {
  return [headers.map(csvCell).join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\r\n') + '\r\n';
}

module.exports = { parseCsv, toCsv, csvCell, detectDelimiter };
