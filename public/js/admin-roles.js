(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, canEdit = S.can('roles.manage');
  var GROUPS = { lead: 'Leads', sla: 'Leads', booking: 'Bookings', callback: 'Service', workshop: 'Service', used: 'Used cars', content: 'Content', prices: 'Content', config: 'Content', admin: 'Admin', users: 'Admin', roles: 'Admin', dashboard: 'Admin', settings: 'Admin', audit: 'Admin', export: 'Admin', upload: 'Admin', exec: 'Insights', datareq: 'Customers', customer: 'Customers' };
  S.api('/api/admin/roles').then(function (r) {
    var roles = r.roles || S.items(r), perms = r.permissions || [];
    var keys = perms.map(function (p) { return p.perm; }), desc = {}; perms.forEach(function (p) { desc[p.perm] = p.description; });
    keys.sort(function (a, b) { var ga = GROUPS[a.split('.')[0]] || 'Other', gb = GROUPS[b.split('.')[0]] || 'Other'; return ga === gb ? (a < b ? -1 : 1) : (ga < gb ? -1 : 1); });
    var head = '<thead><tr><th>Permission</th>' + roles.map(function (x) { return '<th scope="col">' + esc(x.label || x.name) + '</th>'; }).join('') + '</tr></thead>';
    var last = '', body = keys.map(function (k) {
      var g = GROUPS[k.split('.')[0]] || 'Other', row = g !== last ? '<tr class="grp"><td colspan="' + (roles.length + 1) + '">' + esc(g) + '</td></tr>' : ''; last = g;
      return row + '<tr><td><code>' + esc(k) + '</code><br><small class="muted">' + esc(desc[k] || '') + '</small></td>' + roles.map(function (x) { var on = (x.permissions || x.perms || []).indexOf(k) >= 0, lock = x.name === 'admin' || x.name === 'customer'; return '<td><input type="checkbox" data-role="' + esc(x.name) + '" data-perm="' + esc(k) + '" aria-label="' + esc((x.label || x.name) + ': ' + k) + '"' + (on ? ' checked' : '') + (lock || !canEdit ? ' disabled' : '') + '></td>'; }).join('') + '</tr>';
    }).join('');
    $('#matrix').innerHTML = '<table class="tbl dense mx">' + head + '<tbody>' + body + '</tbody></table>';
    $('#matrix').addEventListener('change', function (e) {
      var i = e.target; if (!i.getAttribute('data-role')) return; var role = i.getAttribute('data-role');
      var list = S.$$('[data-role="' + role + '"]').filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-perm'); });
      S.api('/api/admin/roles/' + role + '/permissions', 'PUT', { permissions: list }).then(function () { S.toast('Permissions saved for ' + role); }).catch(function (er) { i.checked = !i.checked; S.toast(S.errText(er), 1); });
    });
  }).catch(function (e) { $('#matrix').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
})();
