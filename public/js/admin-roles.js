(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, canEdit = S.can('roles.manage'), orig = {}, cur = {}, roles = [];
  var GROUPS = { lead: 'Leads', sla: 'Leads', booking: 'Bookings', callback: 'Service', workshop: 'Service', used: 'Used cars', content: 'Content', prices: 'Content', config: 'Content', admin: 'Admin', users: 'Admin', roles: 'Admin', dashboard: 'Admin', settings: 'Admin', audit: 'Admin', export: 'Admin', upload: 'Admin', exec: 'Insights', datareq: 'Customers', customer: 'Customers' };
  function diff() {
    var out = [];
    Object.keys(cur).forEach(function (r) {
      var a = orig[r], b = cur[r], add = b.filter(function (p) { return a.indexOf(p) < 0; }), rem = a.filter(function (p) { return b.indexOf(p) < 0; });
      if (add.length || rem.length) out.push({ role: r, add: add, rem: rem });
    });
    return out;
  }
  function bar() {
    var d = diff(), n = d.reduce(function (a, x) { return a + x.add.length + x.rem.length; }, 0), b = $('#rbar');
    if (!b) { b = document.createElement('div'); b.id = 'rbar'; b.className = 'savebar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Unsaved permission changes'); document.body.appendChild(b); }
    b.hidden = !n;
    b.innerHTML = '<span><strong>' + n + '</strong> unsaved change' + (n === 1 ? '' : 's') + '</span><button class="btn btn-sm btn-o" type="button" id="r-discard">Discard</button><button class="btn btn-sm" type="button" id="r-save">Review and save</button>';
    $('#r-discard').onclick = function () { Object.keys(orig).forEach(function (r) { cur[r] = orig[r].slice(); }); S.$$('[data-role]').forEach(function (i) { i.checked = cur[i.getAttribute('data-role')].indexOf(i.getAttribute('data-perm')) >= 0; }); bar(); };
    $('#r-save').onclick = review;
  }
  function review() {
    var d = diff(), dl = $('#rdlg');
    if (!dl) { dl = document.createElement('dialog'); dl.id = 'rdlg'; dl.setAttribute('aria-labelledby', 'rdlg-t'); document.body.appendChild(dl); S.trap(dl); }
    dl.innerHTML = '<div class="form ed-f"><h2 id="rdlg-t">Confirm permission changes</h2>' + d.map(function (x) { var lbl = (roles.filter(function (r) { return r.name === x.role; })[0] || {}).label || x.role; return '<h3 class="h4">' + esc(lbl) + '</h3><ul class="diff">' + x.add.map(function (p) { return '<li class="add">+ ' + esc(p) + '</li>'; }).join('') + x.rem.map(function (p) { return '<li class="rem">- ' + esc(p) + '</li>'; }).join('') + '</ul>'; }).join('') + '<p class="muted small">These changes take effect for all users of these roles immediately and are written to the audit log.</p><div class="form-msg" role="status" aria-live="polite"></div><div class="cta-row"><button class="btn" type="button" id="rd-ok">Confirm and save</button><button class="btn btn-o" type="button" id="rd-no">Cancel</button></div></div>';
    $('#rd-no').onclick = function () { dl.close(); };
    $('#rd-ok').onclick = function () {
      var m = $('.form-msg', dl), b = this; b.disabled = true;
      Promise.all(d.map(function (x) { return S.api('/api/admin/roles/' + x.role + '/permissions', 'PUT', { permissions: cur[x.role] }).then(function () { orig[x.role] = cur[x.role].slice(); }); }))
        .then(function () { dl.close(); S.toast('Permissions saved'); bar(); }).catch(function (er) { b.disabled = false; m.className = 'form-msg bad'; m.textContent = S.errText(er); });
    };
    dl.showModal();
  }
  S.api('/api/admin/roles').then(function (r) {
    roles = r.roles || S.items(r); var perms = r.permissions || [];
    roles.forEach(function (x) { orig[x.name] = (x.permissions || []).slice(); cur[x.name] = orig[x.name].slice(); });
    var keys = perms.map(function (p) { return p.perm; }), desc = {}; perms.forEach(function (p) { desc[p.perm] = p.description; });
    keys.sort(function (a, b) { var ga = GROUPS[a.split('.')[0]] || 'Other', gb = GROUPS[b.split('.')[0]] || 'Other'; return ga === gb ? (a < b ? -1 : 1) : (ga < gb ? -1 : 1); });
    var head = '<thead><tr><th>Permission</th>' + roles.map(function (x) { return '<th scope="col">' + esc(x.label || x.name) + '</th>'; }).join('') + '</tr></thead>';
    var last = '', body = keys.map(function (k) {
      var g = GROUPS[k.split('.')[0]] || 'Other', row = g !== last ? '<tr class="grp"><td colspan="' + (roles.length + 1) + '">' + esc(g) + '</td></tr>' : ''; last = g;
      return row + '<tr><td><code>' + esc(k) + '</code><br><small class="muted">' + esc(desc[k] || '') + '</small></td>' + roles.map(function (x) { var on = orig[x.name].indexOf(k) >= 0, lock = x.name === 'admin' || x.name === 'customer'; return '<td><input type="checkbox" data-role="' + esc(x.name) + '" data-perm="' + esc(k) + '" aria-label="' + esc((x.label || x.name) + ': ' + k) + '"' + (on ? ' checked' : '') + (lock || !canEdit ? ' disabled' : '') + '></td>'; }).join('') + '</tr>';
    }).join('');
    $('#matrix').innerHTML = '<table class="tbl dense mx">' + head + '<tbody>' + body + '</tbody></table>';
    $('#matrix').addEventListener('change', function (e) {
      var i = e.target, role = i.getAttribute('data-role'); if (!role) return; var p = i.getAttribute('data-perm'), list = cur[role];
      if (i.checked && list.indexOf(p) < 0) list.push(p); if (!i.checked) cur[role] = list.filter(function (x) { return x !== p; });
      bar();
    });
    window.addEventListener('beforeunload', function (e) { if (diff().length) { e.preventDefault(); e.returnValue = ''; } });
  }).catch(function (e) { $('#matrix').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
})();
