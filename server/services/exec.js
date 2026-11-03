'use strict';
/** Read-only executive analytics for the dealer principal. */
const { q, getSetting } = require('../lib/db');
const { today, addDays, toNum, toInt } = require('../lib/util');
const leads = require('./leads');
const admin = require('./admin');
const { cbSla } = require('./callbacks');

const RANK = { new: 0, contacted: 1, test_drive: 2, negotiation: 3, won: 4, lost: 1 };

function summary(days = 30) {
  days = Math.min(365, Math.max(1, toInt(days, 30)));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = q.all('SELECT l.*, s.name_en AS showroom_name FROM leads l LEFT JOIN showrooms s ON s.id = l.showroom_id WHERE l.created_at >= ?', since);
  const by = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x) || 'unknown'; m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count); };
  let inSla = 0, responded = 0, late = 0, sumMin = 0, wonIn = 0, wonLate = 0, nIn = 0, nLate = 0;
  for (const l of rows) {
    const s = leads.sla(l);
    if (s.responded) { responded++; sumMin += s.response_sec / 60; }
    if (s.breached) { late++; nLate++; if (l.status === 'won') wonLate++; }
    else if (s.responded) { inSla++; nIn++; if (l.status === 'won') wonIn++; }
  }
  const funnel = ['new', 'contacted', 'test_drive', 'negotiation', 'won'].map((st, i) => ({ stage: st, count: rows.filter(l => RANK[l.status] >= i).length }));
  const contribution = toNum(getSetting('exec_contribution_lead', '25000'), 25000);
  const cbContribution = toNum(getSetting('exec_contribution_callback', '4500'), 4500);
  const defaultGap = toNum(getSetting('exec_default_conversion_gap', '0.10'), 0.1);
  const measured = nIn >= 5 && nLate >= 5 ? wonIn / nIn - wonLate / nLate : null;
  const gap = Math.round((measured !== null && measured > 0 ? measured : defaultGap) * 1000) / 1000;
  const cbs = q.all('SELECT * FROM service_callbacks WHERE created_at >= ?', since);
  const cbUnanswered = cbs.filter(c => cbSla(c).breached).length;
  const leadsRisk = late * gap * contribution;
  const cbRisk = cbUnanswered * 0.5 * cbContribution * 0.3;
  const td = q.get("SELECT COUNT(*) booked, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM bookings WHERE type='test_drive' AND created_at >= ?", since);
  const nowMs = Date.now();
  const age = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const u of q.all("SELECT created_at FROM used_cars WHERE status IN ('available','booked')")) {
    const d = (nowMs - Date.parse(u.created_at)) / 86400000;
    age[d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+']++;
  }
  const st = leads.stats({ role: 'admin' });
  return {
    window_days: days, generated_at: new Date().toISOString(),
    sla: { pct_within_5min: responded ? Math.round(inSla * 1000 / Math.max(1, responded + rows.filter(l => !l.first_response_at && leads.sla(l).breached).length)) / 10 : null, breached: late, avg_response_min: responded ? Math.round(sumMin * 10 / responded) / 10 : null, total_leads: rows.length },
    leads_by_source: by(rows, l => l.source), leads_by_showroom: by(rows, l => l.showroom_name), funnel,
    test_drives: { booked: td.booked || 0, completed: td.completed || 0 },
    service_utilisation: admin.dashboard().service_utilisation,
    callbacks: { total: cbs.length, unanswered_or_late: cbUnanswered },
    used_stock_ageing: Object.entries(age).map(([bucket, count]) => ({ bucket, count })),
    per_consultant: st.per_consultant,
    revenue_at_risk: {
      total: Math.round(leadsRisk) + Math.round(cbRisk),
      formula: 'late_leads x conversion_gap x contribution_per_lead + unanswered_callbacks x 0.5 x callback_contribution x 0.30',
      leads: { late_leads: late, conversion_gap: Math.round(gap * 1000) / 1000, gap_source: measured !== null && measured > 0 ? 'measured' : 'default', contribution_per_lead: contribution, amount: Math.round(leadsRisk) },
      callbacks: { unanswered: cbUnanswered, callback_contribution: cbContribution, amount: Math.round(cbRisk) },
    },
  };
}

function trend(days = 30) {
  days = Math.min(365, Math.max(1, toInt(days, 30)));
  const start = addDays(today(), -(days - 1));
  const out = {};
  for (let i = 0; i < days; i++) out[addDays(start, i)] = { date: addDays(start, i), leads: 0, responded_in_sla: 0, breached: 0, won: 0, test_drives_booked: 0, service_bookings: 0 };
  for (const l of q.all('SELECT * FROM leads WHERE substr(created_at,1,10) >= ?', start)) {
    const d = out[l.created_at.slice(0, 10)]; if (!d) continue;
    d.leads++; const s = leads.sla(l);
    if (s.breached) d.breached++; else if (s.responded) d.responded_in_sla++;
    if (l.status === 'won') d.won++;
  }
  for (const b of q.all('SELECT type, created_at FROM bookings WHERE substr(created_at,1,10) >= ?', start)) {
    const d = out[b.created_at.slice(0, 10)]; if (!d) continue;
    if (b.type === 'test_drive') d.test_drives_booked++; else d.service_bookings++;
  }
  const series = Object.values(out).map(d => ({ ...d, sla_pct: d.leads ? Math.round(d.responded_in_sla * 1000 / d.leads) / 10 : null }));
  return { days, series };
}

module.exports = { summary, trend };
