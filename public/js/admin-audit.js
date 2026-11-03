(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc;
  S.api('/api/admin/audit').then(function (r) {
    var it = S.items(r);
    $('#au-tbl tbody').innerHTML = it.length ? it.map(function (x) { var d = typeof x.detail === 'string' ? x.detail : JSON.stringify(x.detail || ''); return '<tr><td>' + esc(S.fmtDT(x.created_at)) + '</td><td>' + esc(x.user_email || '') + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.entity + ' ' + (x.entity_id || '')) + '</td><td><small class="muted">' + esc(d.slice(0, 160)) + '</small></td></tr>'; }).join('') : '<tr><td colspan="5" class="empty">No entries.</td></tr>';
  }).catch(function (e) { $('#au-tbl tbody').innerHTML = '<tr><td colspan="5" class="err" role="alert">' + esc(e.message) + '</td></tr>'; });
})();
