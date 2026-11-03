(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, rows = [], refs = {}, canM = S.can('users.manage');
  function load() {
    Promise.all([S.api('/api/admin/users'), S.ref('showrooms').catch(function () { return []; }), S.ref('workshops').catch(function () { return []; })]).then(function (a) {
      rows = S.items(a[0]); refs.sh = a[1]; refs.ws = a[2]; draw();
    }).catch(function (e) { $('#us-tbl tbody').innerHTML = '<tr><td class="err" role="alert">' + esc(e.message) + '</td></tr>'; });
  }
  function draw() {
    var q = ($('#us-q').value || '').toLowerCase();
    var vis = rows.filter(function (u) { return !q || (u.name + ' ' + u.email).toLowerCase().indexOf(q) >= 0; });
    $('#us-tbl thead').innerHTML = '<tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th>Status</th>' + (canM ? '<th></th>' : '') + '</tr>';
    $('#us-tbl tbody').innerHTML = vis.length ? vis.map(function (u) {
      var scope = u.showroom_id ? S.refName('showrooms', u.showroom_id, refs.sh) : u.workshop_id ? S.refName('workshops', u.workshop_id, refs.ws) : 'All';
      return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + esc(String(u.role).replace(/_/g, ' ')) + '</td><td>' + esc(scope) + '</td><td><span class="chip ' + (u.active ? 'on' : 'off') + '">' + (u.active ? 'active' : 'inactive') + '</span></td>' +
        (canM ? '<td style="white-space:nowrap"><button class="btn btn-sm btn-o" type="button" data-e="' + u.id + '">Edit</button> <button class="btn btn-sm btn-o" type="button" data-pw="' + u.id + '">Reset password</button> <button class="btn btn-sm btn-o" type="button" data-ac="' + u.id + '">' + (u.active ? 'Deactivate' : 'Activate') + '</button></td>' : '') + '</tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No users.</td></tr>';
  }
  var find = function (id) { return rows.filter(function (u) { return String(u.id) === String(id); })[0]; };
  $('#us-tbl').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.e) S.editor('users', find(b.dataset.e), load);
    if (b.dataset.pw && confirm('Reset password? The user is signed out everywhere and must change the temporary password.')) S.api('/api/admin/users/' + b.dataset.pw + '/reset-password', 'POST', {}).then(function (r) { alert('Temporary password for ' + r.email + ':\n\n' + r.temp_password + '\n\nShown once. Share it securely.'); S.toast('Password reset, sessions revoked'); }).catch(function (er) { S.toast(S.errText(er), 1); });
    if (b.dataset.ac) { var u = find(b.dataset.ac); S.api('/api/admin/users/' + u.id, 'PUT', { active: u.active ? 0 : 1 }).then(function () { S.toast(u.active ? 'Deactivated' : 'Activated'); load(); }).catch(function (er) { S.toast(S.errText(er), 1); }); }
  });
  $('#us-q').addEventListener('input', draw);
  var add = $('#us-add'); if (add) add.addEventListener('click', function () { S.editor('users', null, load); });
  load();
})();
