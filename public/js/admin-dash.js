(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc;
  S.api('/api/admin/dashboard').then(function (d) {
    var k = function (l, v, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '"><small>' + l + '</small><strong>' + esc(v) + '</strong></div>'; };
    var sla = d.sla || {}, util = d.service_utilisation || [], avgU = util.length ? Math.round(util.reduce(function (a, x) { return a + (x.pct || 0); }, 0) / util.length) : 0;
    $('#kpis').innerHTML = k('Replied within 5 min', sla.pct_within_5min == null ? '-' : sla.pct_within_5min + '%') + k('SLA breached', sla.breached || 0, sla.breached > 0) + k('Avg response (min)', sla.avg_response_min == null ? '-' : sla.avg_response_min) + k('Total leads', d.leads_total || 0) + k('Test drives upcoming', d.test_drives_upcoming || 0) + k('Service utilisation today', avgU + '%');
    var lp = d.leads_per_day || [], mx = Math.max.apply(null, lp.map(function (x) { return x.n; }).concat([1]));
    $('#ch-leads').innerHTML = lp.length ? lp.map(function (x) { return '<div class="bar-c" style="height:' + Math.max(2, x.n / mx * 150) + 'px" title="' + esc(x.d + ': ' + x.n) + '" role="img" aria-label="' + esc(x.d + ' ' + x.n + ' leads') + '"><span>' + x.n + '</span></div>'; }).join('') : '<p class="muted">No data</p>';
    $('#ch-util').innerHTML = util.length ? util.map(function (u) { return '<div class="hb"><span>' + esc(u.workshop) + '</span><div><i style="width:' + Math.min(100, u.pct) + '%"></i></div><strong>' + u.pct + '%</strong></div>'; }).join('') : '<p class="muted">No workshops</p>';
    var bs = d.by_status || {}, tot = Math.max(1, d.leads_total || 1);
    $('#ch-status').innerHTML = Object.keys(bs).map(function (s) { return '<div class="hb"><span>' + esc(s.replace('_', ' ')) + '</span><div><i style="width:' + (bs[s] / tot * 100) + '%"></i></div><strong>' + bs[s] + '</strong></div>'; }).join('');
  }).catch(function (e) { $('#kpis').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  var dd = $('#dms-d'), a = $('#dms-a'); dd.value = new Date().toISOString().slice(0, 10);
  function href() { a.href = '/api/admin/export/dms.csv?date=' + dd.value; } dd.addEventListener('change', href); href();
  S.api('/api/admin/audit').then(function (r) {
    var it = S.items(r).slice(0, 12); $('#audit').innerHTML = it.length ? '<ul class="tl">' + it.map(function (x) { return '<li><small>' + esc(S.fmtDT(x.created_at)) + ' ' + esc(x.user_email || '') + '</small>' + esc(x.action + ' ' + x.entity + ' ' + (x.entity_id || '')) + '</li>'; }).join('') + '</ul>' : 'No changes yet.';
  }).catch(function () { $('#audit').textContent = ''; });
})();
