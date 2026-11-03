(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc;
  function bars(arr, key, val, cls) { var mx = Math.max.apply(null, arr.map(function (x) { return x[val]; }).concat([1])); return arr.map(function (x) { return '<div class="bar-l"><span>' + esc(String(x[key]).replace('_', ' ')) + '</span><div><i class="' + (cls || '') + '" style="width:' + (x[val] / mx * 100) + '%"></i></div><strong>' + x[val] + '</strong></div>'; }).join('') || '<p class="muted">No data</p>'; }
  function line(series) {
    var W = 640, H = 220, P = 28, n = series.length, mx = Math.max.apply(null, series.map(function (d) { return d.leads; }).concat([1]));
    var X = function (i) { return P + i * (W - 2 * P) / Math.max(1, n - 1); }, Y = function (v) { return H - P - v / mx * (H - 2 * P); };
    var path = function (k) { return series.map(function (d, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(d[k]).toFixed(1); }).join(' '); };
    var grid = [0, .5, 1].map(function (g) { var y = Y(mx * g); return '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y + '" y2="' + y + '" stroke="#e4e4e6"/><text x="4" y="' + (y + 4) + '" font-size="10" fill="#5f6168">' + Math.round(mx * g) + '</text>'; }).join('');
    var lbl = [0, Math.floor(n / 2), n - 1].map(function (i) { return series[i] ? '<text x="' + X(i) + '" y="' + (H - 6) + '" font-size="10" text-anchor="middle" fill="#5f6168">' + esc(series[i].date.slice(5)) + '</text>' : ''; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Leads, breached and won per day for the last ' + n + ' days">' + grid + lbl + '<path d="' + path('leads') + '" fill="none" stroke="#0b0b0b" stroke-width="2.5"/><path d="' + path('breached') + '" fill="none" stroke="#e10600" stroke-width="2"/><path d="' + path('won') + '" fill="none" stroke="#2d8a4e" stroke-width="2"/></svg>';
  }
  Promise.all([S.api('/api/exec/summary?days=30'), S.api('/api/exec/trend?days=30')]).then(function (a) {
    var s = a[0], t = a[1], sla = s.sla || {}, f = s.funnel || [], won = (f[4] || {}).count || 0, tot = (f[0] || {}).count || 0;
    var k = function (l, v, sub, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '"><small>' + l + '</small><strong>' + esc(v) + '</strong>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div>'; };
    $('#kpis').innerHTML = k('Replied within 5 min', sla.pct_within_5min == null ? '-' : sla.pct_within_5min + '%', 'avg ' + (sla.avg_response_min == null ? '-' : sla.avg_response_min) + ' min') + k('Leads (30 d)', tot) + k('Won', won, tot ? Math.round(won * 100 / tot) + '% conversion' : '') + k('SLA breaches', sla.breached || 0, '', sla.breached > 0) + k('Revenue at risk', S.inr((s.revenue_at_risk || {}).total || 0), 'estimate', true);
    $('#ch-trend').innerHTML = line(t.series || []);
    $('#funnel').innerHTML = bars(f, 'stage', 'count');
    $('#sources').innerHTML = bars(s.leads_by_source || [], 'key', 'count');
    $('#showrooms').innerHTML = bars(s.leads_by_showroom || [], 'key', 'count', 'r');
    var r = s.revenue_at_risk || {}, lr = r.leads || {}, cr = r.callbacks || {};
    $('#risk').innerHTML = '<p class="big">' + esc(S.inr(r.total || 0)) + '</p><p>' + esc(lr.late_leads) + ' late leads x ' + esc(Math.round((lr.conversion_gap || 0) * 100)) + '% conversion gap (' + esc(lr.gap_source) + ') = ' + esc(S.inr(lr.amount)) + '. ' + esc(cr.unanswered || 0) + ' unanswered call-backs = ' + esc(S.inr(cr.amount || 0)) + '.</p><code>' + esc(r.formula || '') + '</code>';
    var u = s.service_utilisation || [], ag = s.used_stock_ageing || [];
    $('#ops').innerHTML = '<h3 class="h4">Workshop utilisation today</h3>' + (u.length ? u.map(function (x) { return '<div class="bar-l"><span>' + esc(x.workshop) + '</span><div><i style="width:' + Math.min(100, x.pct) + '%"></i></div><strong>' + x.pct + '%</strong></div>'; }).join('') : '<p class="muted">No data</p>') + '<h3 class="h4">Used stock ageing (days)</h3>' + bars(ag, 'bucket', 'count', 'r') + '<p class="muted small">Test drives: ' + esc((s.test_drives || {}).booked) + ' booked, ' + esc((s.test_drives || {}).completed) + ' completed. Call-backs: ' + esc((s.callbacks || {}).total) + ' (' + esc((s.callbacks || {}).unanswered_or_late) + ' late).</p>';
    $('#cons').innerHTML = '<table class="tbl dense"><thead><tr><th>Consultant</th><th>Leads</th><th>Open</th><th>Breached</th><th>% in 5 min</th><th>Avg min</th></tr></thead><tbody>' + (s.per_consultant || []).map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td>' + c.total + '</td><td>' + c.open + '</td><td>' + c.breached + '</td><td>' + (c.pct_within_5min == null ? '-' : c.pct_within_5min + '%') + '</td><td>' + (c.avg_response_min == null ? '-' : c.avg_response_min) + '</td></tr>'; }).join('') + '</tbody></table>';
  }).catch(function (e) { $('#kpis').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
})();
