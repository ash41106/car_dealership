(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, box = $('#crud'), cur = box.getAttribute('data-resources').split(',')[0];
  var REFS = { model_id: 'models', showroom_id: 'showrooms', default_showroom_id: 'showrooms', city_id: 'cities' };
  function cell(col, v, refs) {
    if (v === 1 || v === 0) return v ? 'Yes' : '-';
    if (REFS[col]) return esc(S.refName(REFS[col], v, refs[col]));
    if (col === 'ex_showroom' || col === 'accessories_amount' || col === 'amount') return esc(S.inr(v));
    return esc(v == null ? '' : v);
  }
  function load() {
    var cfg = CFG[cur]; box.innerHTML = '<div class="skel row"></div>';
    var need = cfg.cols.filter(function (c) { return REFS[c]; });
    Promise.all([S.api('/api/admin/' + cur)].concat(need.map(function (c) { return S.ref(REFS[c]); }))).then(function (a) {
      var rows = S.items(a[0]), refs = {}; need.forEach(function (c, i) { refs[c] = a[i + 1]; });
      box.innerHTML = '<div class="s-bar"><h2>' + esc(S.pretty(cur)) + ' (' + rows.length + ')</h2><button class="btn btn-sm" type="button" id="add">Add ' + esc(cfg.label.toLowerCase()) + '</button></div>' +
        (rows.length ? '<div class="tbl-w"><table class="tbl dense"><thead><tr>' + cfg.cols.map(function (c) { return '<th>' + esc(S.pretty(c.replace(/_id$/, ''))) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
          rows.map(function (r) { return '<tr>' + cfg.cols.map(function (c) { return '<td>' + cell(c, r[c], refs) + '</td>'; }).join('') + '<td style="white-space:nowrap"><button class="btn btn-sm btn-o" data-edit="' + esc(r.id) + '" type="button">Edit</button> <button class="btn btn-sm btn-o" data-del="' + esc(r.id) + '" type="button" aria-label="Delete">Delete</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">Nothing here yet.</p>');
      $('#add').onclick = function () { S.editor(cur, null, load); };
      box.onclick = function (e) {
        var ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
        if (ed) { var row = rows.filter(function (r) { return String(r.id) === ed.getAttribute('data-edit'); })[0]; S.editor(cur, row, load); }
        if (dl && confirm('Delete this ' + cfg.label.toLowerCase() + '? This cannot be undone.')) S.api('/api/admin/' + cur + '/' + dl.getAttribute('data-del'), 'DELETE').then(function () { S.toast('Deleted'); load(); }).catch(function (er) { S.toast(S.errText(er), 1); });
      };
    }).catch(function (e) { box.innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  var tabs = $('#rtabs'); if (tabs) tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-res]'); if (!b) return; S.$$('#rtabs .pill').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); cur = b.getAttribute('data-res'); load(); });
  load();
})();
