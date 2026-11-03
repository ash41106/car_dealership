(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, rows = [], can = !!window.__CANSUGGEST, canW = S.can('used.write'), fmt = function (n) { return S.inr(n); };
  function load() {
    S.api('/api/admin/used').then(function (r) {
      rows = S.items(r); var showSold = $('#u-showsold').checked;
      var vis = rows.filter(function (x) { return showSold || x.status !== 'sold'; });
      $('#u-tbl tbody').innerHTML = vis.length ? vis.map(function (u) {
        return '<tr><td>' + esc(u.stock_id) + '</td><td>' + esc(u.model + ' ' + u.variant) + '<br><small class="muted">' + esc(u.fuel + ' ' + u.transmission) + '</small></td><td>' + esc(u.year) + '</td><td>' + esc(Number(u.km).toLocaleString('en-IN')) + '</td>' +
          '<td><label class="sr" for="p' + u.id + '">Price</label><input id="p' + u.id + '" type="number" data-id="' + esc(u.id) + '" data-f="price" value="' + esc(u.price) + '" style="min-width:120px"' + (canW ? '' : ' disabled') + '></td>' +
          '<td><label class="sr" for="s' + u.id + '">Status</label><select id="s' + u.id + '" data-id="' + esc(u.id) + '" data-f="status"' + (canW ? '' : ' disabled') + '>' + S.opts(['available', 'booked', 'sold'], u.status) + '</select></td>' +
          '<td style="white-space:nowrap">' + (canW ? '<button class="btn btn-sm btn-o" type="button" data-edit="' + esc(u.id) + '">Edit</button> ' : '') + (can ? '<button class="btn btn-sm btn-o" type="button" data-sug="' + esc(u.id) + '">AI price band</button>' : '') + '</td></tr>' +
          '<tr data-band="' + esc(u.id) + '" hidden><td colspan="7"></td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No cars.</td></tr>';
    }).catch(function (e) { $('#u-tbl tbody').innerHTML = '<tr><td colspan="7" class="err" role="alert">' + esc(e.message) + '</td></tr>'; });
  }
  var tb = $('#u-tbl tbody');
  tb.addEventListener('change', function (e) {
    var i = e.target; if (!i.getAttribute('data-f')) return; var o = {}; o[i.getAttribute('data-f')] = i.type === 'number' ? +i.value : i.value;
    S.api('/api/admin/used/' + i.getAttribute('data-id'), 'PUT', o).then(function () { S.toast('Saved'); }).catch(function (er) { S.toast(S.errText(er), 1); load(); });
  });
  tb.addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]'), sg = e.target.closest('[data-sug]');
    if (ed) S.editor('used', rows.filter(function (r) { return String(r.id) === ed.getAttribute('data-edit'); })[0], load);
    if (sg) {
      var id = sg.getAttribute('data-sug'), tr = $('[data-band="' + id + '"]'), td = tr.firstChild;
      if (!tr.hidden) { tr.hidden = true; return; } tr.hidden = false; td.innerHTML = '<div class="skel row"></div>';
      S.api('/api/admin/used/' + id + '/suggestion').then(function (s) {
        s = s.suggestion || s;
        td.innerHTML = '<div class="ai-box" style="padding:12px;border:1px dashed #999;border-radius:10px"><span class="ai-tag">AI-generated - review before use</span> Suggested band <strong>' + fmt(s.low) + ' - ' + fmt(s.high) + '</strong> (mid ' + fmt(s.mid) + ') from ' + esc(s.comps) + ' comparable sales. <span class="muted">' + esc(s.basis || '') + '</span></div>';
      }).catch(function (er) { td.innerHTML = '<p class="err" role="alert">' + esc(er.message) + '</p>'; });
    }
  });
  if ($('#u-add')) $('#u-add').addEventListener('click', function () { S.editor('used', null, load); });
  $('#u-showsold').addEventListener('change', load);
  load();
})();
