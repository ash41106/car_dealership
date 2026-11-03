(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, date = new Date().toISOString().slice(0, 10), canUpd = S.can('booking.update');
  var COLS = [['booked', 'Booked'], ['checked_in', 'Checked in'], ['in_progress', 'In progress'], ['ready', 'Ready'], ['delivered', 'Delivered']], NEXT = { booked: 'checked_in', confirmed: 'checked_in', checked_in: 'in_progress', in_progress: 'ready', ready: 'delivered' };
  $('#sv-date').value = date;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(s) { return S.dur(s); }
  setInterval(function () { S.$$('[data-due]').forEach(function (el) { var rem = (Date.parse(el.getAttribute('data-due')) - Date.now()) / 1000, c = 'g', t = mmss(rem) + ' left'; if (rem < 0) { c = 'r'; t = 'Late +' + mmss(rem); } else if (rem <= 300) c = 'a'; el.className = 'sla ' + c; el.textContent = t; }); }, 1000);
  function jc(b) {
    var n = NEXT[b.status];
    return '<div class="jc" draggable="' + canUpd + '" data-id="' + esc(b.id) + '"><strong>' + esc(b.time) + ' &middot; ' + esc(b.reg_no || '-') + '</strong><span>' + esc(b.model_name || '') + ' ' + (b.pickup_drop ? '<span class="chip">pickup/drop</span>' : '') + '</span><small>' + esc(b.name) + ' &middot; <a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a> &middot; ' + esc(b.service_type || '') + '</small><small>' + esc(b.workshop_name || '') + '</small>' +
      (canUpd ? '<div class="acts">' + (n ? '<button type="button" data-mv="' + n + '">Move to ' + n.replace('_', ' ') + '</button>' : '') + (b.status !== 'delivered' && b.status !== 'cancelled' ? '<button type="button" data-mv="no_show">No show</button><button type="button" data-mv="cancelled">Cancel</button>' : '') + '</div>' : '') + '</div>';
  }
  var rows = [], workshops = [];
  function draw() {
    $('#board').innerHTML = COLS.map(function (c) { var l = rows.filter(function (b) { return b.status === c[0] || (c[0] === 'booked' && b.status === 'confirmed') || (c[0] === 'delivered' && b.status === 'completed'); }); return '<div class="bcol" data-col="' + c[0] + '"><h3>' + c[1] + ' <span>' + l.length + '</span></h3>' + l.map(jc).join('') + '</div>'; }).join('');
    var per = {}; rows.filter(function (b) { return b.status !== 'cancelled' && b.status !== 'no_show'; }).forEach(function (b) { per[b.workshop_id] = (per[b.workshop_id] || 0) + 1; });
    $('#bays').innerHTML = workshops.map(function (w) { var cap = w.bays * 7, used = per[w.id] || 0, p = Math.min(100, Math.round(used / cap * 100)); return '<div class="bar-l"><span>' + esc(w.name_en) + ' (' + w.bays + ' bays)</span><div><i class="' + (p > 85 ? 'r' : '') + '" style="width:' + p + '%"></i></div><strong>' + used + ' jobs &middot; ' + p + '%</strong></div>'; }).join('') || '<p class="muted">No workshops in scope.</p>';
  }
  function load() {
    Promise.all([S.api('/api/staff/bookings?type=service&date=' + $('#sv-date').value), S.api('/api/workshops')]).then(function (a) { rows = S.items(a[0]); workshops = S.items(a[1]).filter(function (w) { return !S.user.workshop_id || w.id === S.user.workshop_id; }); draw(); })
      .catch(function (e) { $('#board').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  function move(id, st) { S.api('/api/staff/bookings/' + id, 'PATCH', { status: st }).then(function () { S.toast('Job card updated'); load(); }).catch(function (e) { S.toast(S.errText(e), 1); load(); }); }
  var bd = $('#board');
  bd.addEventListener('click', function (e) { var b = e.target.closest('[data-mv]'); if (b) move(b.closest('.jc').getAttribute('data-id'), b.getAttribute('data-mv')); });
  bd.addEventListener('dragstart', function (e) { var j = e.target.closest('.jc'); if (!j) return; e.dataTransfer.setData('text/plain', j.getAttribute('data-id')); j.classList.add('drag'); });
  bd.addEventListener('dragend', function (e) { var j = e.target.closest('.jc'); if (j) j.classList.remove('drag'); S.$$('.bcol.over').forEach(function (c) { c.classList.remove('over'); }); });
  bd.addEventListener('dragover', function (e) { var c = e.target.closest('.bcol'); if (c && canUpd) { e.preventDefault(); c.classList.add('over'); } });
  bd.addEventListener('dragleave', function (e) { var c = e.target.closest('.bcol'); if (c) c.classList.remove('over'); });
  bd.addEventListener('drop', function (e) { var c = e.target.closest('.bcol'); if (!c || !canUpd) return; e.preventDefault(); move(e.dataTransfer.getData('text/plain'), c.getAttribute('data-col')); });
  $('#sv-date').addEventListener('change', load);
  // call-back queue
  var cbq = $('#cbq');
  function loadCb() {
    if (!S.can('callback.read')) { cbq.innerHTML = '<p class="muted">Not available for your role.</p>'; return; }
    S.api('/api/staff/callbacks').then(function (r) {
      var it = S.items(r); $('#n-cb').textContent = it.filter(function (c) { return c.status === 'new'; }).length;
      cbq.innerHTML = it.length ? it.map(function (c) { return '<div class="mini"><div class="row1"><strong>' + esc(c.name) + ' <a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a></strong>' + (c.sla && !c.sla.responded ? '<span class="sla g" data-due="' + esc(c.sla.due_at) + '">--:--</span>' : '<span class="sla n">' + esc(c.status) + '</span>') + '</div><small class="muted">' + esc(c.workshop_name || '') + ' ' + esc(c.message || c.notes || '') + '</small>' + (S.can('callback.update') ? '<div class="rowf"><label class="sr" for="cb' + c.id + '">Status</label><select id="cb' + c.id + '" data-cb="' + esc(c.id) + '">' + S.opts(['new', 'contacted', 'scheduled', 'closed'], c.status) + '</select></div>' : '') + '</div>'; }).join('') : '<p class="muted">No call-backs. Nice.</p>';
    }).catch(function (e) { cbq.innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  cbq.addEventListener('change', function (e) { var s = e.target.closest('[data-cb]'); if (s) S.api('/api/staff/callbacks/' + s.getAttribute('data-cb'), 'PATCH', { status: s.value }).then(function () { S.toast('Call-back updated'); loadCb(); }).catch(function (er) { S.toast(S.errText(er), 1); }); });
  load(); loadCb(); setInterval(loadCb, 15000);
})();
