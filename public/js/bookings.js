(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, box = $('#blist'), type = ($('#btabs .pill') || {}).getAttribute ? $('#btabs .pill').getAttribute('data-type') : 'test_drive';
  var STAT = ['booked', 'confirmed', 'completed', 'cancelled', 'no_show', 'checked_in', 'in_progress', 'ready', 'delivered'];
  function load() {
    var q = '?type=' + type + ($('#b-date').value ? '&date=' + $('#b-date').value : '');
    box.innerHTML = '<div class="skel row"></div>';
    S.api('/api/staff/bookings' + q).then(function (r) {
      var it = S.items(r);
      if (!it.length) { box.innerHTML = '<p class="empty">No bookings found.</p>'; return; }
      box.innerHTML = '<div class="tbl-w"><table class="tbl dense"><thead><tr><th>When</th><th>Customer</th><th>' + (type === 'service' ? 'Vehicle' : 'Model') + '</th><th>' + (type === 'service' ? 'Workshop' : 'Showroom') + '</th><th>Status</th></tr></thead><tbody>' + it.map(function (b) {
        return '<tr><td>' + esc(b.date) + '<br><strong>' + esc(b.time) + '</strong></td><td>' + esc(b.name) + '<br><a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a></td><td>' + esc(type === 'service' ? [b.model_name, b.reg_no, b.service_type, b.pickup_drop ? 'pickup/drop' : ''].filter(Boolean).join(' / ') : (b.model_name_ref || b.model_name || '')) + '</td><td>' + esc(b.workshop_name || b.showroom_name || '') + '</td><td><label class="sr" for="bs' + b.id + '">Status</label><select id="bs' + b.id + '" data-id="' + esc(b.id) + '"' + (S.can('booking.update') ? '' : ' disabled') + '>' + S.opts(STAT, b.status) + '</select></td></tr>';
      }).join('') + '</tbody></table></div>';
    }).catch(function (e) { box.innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  box.addEventListener('change', function (e) { var s = e.target.closest('select[data-id]'); if (!s) return; S.api('/api/staff/bookings/' + s.getAttribute('data-id'), 'PATCH', { status: s.value }).then(function () { S.toast('Status updated'); }).catch(function (er) { S.toast(S.errText(er), 1); load(); }); });
  $('#btabs').addEventListener('click', function (e) { var b = e.target.closest('[data-type]'); if (!b) return; S.$$('#btabs .pill').forEach(function (x) { x.classList.toggle('on', x === b); }); type = b.getAttribute('data-type'); load(); });
  $('#b-date').addEventListener('change', load); load();
})();
