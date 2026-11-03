(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc;
  var T = function (n, l, t, o) { var f = { n: n, l: l, t: t || 'number' }; if (o) for (var k in o) f[k] = o[k]; return f; };
  CFG['price-rules'] = { label: 'Price rule', fields: [T('city_id', 'City', 'ref', { ref: 'cities' }), T('model_id', 'Model override (blank = all models)', 'ref', { ref: 'models', blank: 1 }), T('road_tax_pct', 'Road tax % (below threshold)'), T('road_tax_pct_high', 'Road tax % (above threshold)'), T('road_tax_threshold', 'Road tax threshold (INR ex-showroom)'), T('registration_fee', 'Registration and smart-card fee (INR)'), T('insurance_pct', 'Insurance % of ex-showroom'), T('handling', 'Handling / logistics (INR)'), T('fastag', 'FASTag (INR)'), T('tcs_pct', 'TCS %'), T('tcs_threshold', 'TCS applies above (INR)'), T('valid_until', 'Valid until', 'date'), T('active', 'Active', 'bool')] };
  var COLS = [['city_id', 'City', 'ref:cities'], ['model_id', 'Model', 'ref:models'], ['road_tax_pct', 'Road tax %', 'n'], ['road_tax_pct_high', 'Tax % high', 'n'], ['road_tax_threshold', 'Threshold', 'n'], ['registration_fee', 'Reg. fee', 'n'], ['insurance_pct', 'Insurance %', 'n'], ['handling', 'Handling', 'n'], ['fastag', 'FASTag', 'n'], ['tcs_pct', 'TCS %', 'n'], ['tcs_threshold', 'TCS above', 'n'], ['valid_until', 'Valid until', 'd'], ['active', 'Active', 'b']];
  var variants = [], cities = [], models = [];
  function save(inp, id, field, val) {
    var td = inp.closest('td'); td.classList.remove('saved', 'fail'); var o = {}; o[field] = val;
    S.api('/api/admin/' + inp.getAttribute('data-r') + '/' + id, 'PUT', o).then(function () { td.classList.add('saved'); S.toast('Saved'); preview(); }).catch(function (e) { td.classList.add('fail'); S.toast(S.errText(e), 1); });
  }
  function bind(tbl) {
    tbl.addEventListener('change', function (e) {
      var i = e.target; if (!i.getAttribute('data-f')) return; var v;
      if (i.type === 'checkbox') v = i.checked ? 1 : 0; else { v = i.value.trim(); if (i.type === 'number') { if (v === '') { v = null; } else v = +v; } else if (v === '') v = null; else if (i.tagName === 'SELECT') v = +v; }
      save(i, i.getAttribute('data-id'), i.getAttribute('data-f'), v);
    });
  }
  function rules() {
    S.api('/api/admin/price-rules').then(function (r) {
      var rows = S.items(r), th = $('#pr-tbl thead'), tb = $('#pr-tbl tbody');
      th.innerHTML = '<tr>' + COLS.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th></th></tr>';
      tb.innerHTML = rows.length ? rows.map(function (x) {
        return '<tr>' + COLS.map(function (c) {
          var a = ' data-r="price-rules" data-id="' + esc(x.id) + '" data-f="' + c[0] + '" aria-label="' + esc(c[1]) + ' row ' + esc(x.id) + '"', v = x[c[0]];
          if (c[2].indexOf('ref:') === 0) { var list = c[2] === 'ref:cities' ? cities : models; return '<td><select' + a + '>' + S.opts(list.map(function (m) { return [m.id, m.name_en || m.name]; }), v, c[0] === 'model_id' ? 'All models' : null) + '</select></td>'; }
          if (c[2] === 'n') return '<td><input type="number" step="any"' + a + ' value="' + esc(v == null ? '' : v) + '"></td>';
          if (c[2] === 'd') return '<td><input type="date"' + a + ' value="' + esc(v || '') + '"></td>';
          return '<td><input type="checkbox"' + a + (v ? ' checked' : '') + '></td>';
        }).join('') + '<td><button class="btn btn-sm btn-o" type="button" data-del="' + esc(x.id) + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="14" class="empty">No rules yet. Add one per city.</td></tr>';
      tb.onclick = function (e) { var d = e.target.closest('[data-del]'); if (d && confirm('Delete this rule?')) S.api('/api/admin/price-rules/' + d.getAttribute('data-del'), 'DELETE').then(function () { S.toast('Deleted'); rules(); preview(); }).catch(function (er) { S.toast(S.errText(er), 1); }); };
    }).catch(function (e) { $('#pr-tbl tbody').innerHTML = '<tr><td class="err" role="alert">' + esc(e.message) + '</td></tr>'; });
  }
  function vtable() {
    $('#vr-tbl thead').innerHTML = '<tr><th>Model</th><th>Variant</th><th>Fuel</th><th>Ex-showroom (INR)</th></tr>';
    $('#vr-tbl tbody').innerHTML = variants.map(function (v) { return '<tr><td>' + esc(S.refName('models', v.model_id, models)) + '</td><td>' + esc(v.name) + '</td><td>' + esc(v.fuel + ' ' + v.transmission) + '</td><td><input type="number" data-r="variants" data-id="' + esc(v.id) + '" data-f="ex_showroom" aria-label="Ex-showroom ' + esc(v.name) + '" value="' + esc(v.ex_showroom) + '"></td></tr>'; }).join('');
  }
  var seq = 0;
  function preview() {
    var v = $('#pc-var').value, out = $('#pc-out'); if (!v) return; var n = ++seq;
    S.api('/ui/onroad?variant=' + v + '&city=' + $('#pc-city').value + '&accessories=' + ($('#pc-acc').checked ? 1 : 0)).then(function (r) { if (n === seq) out.innerHTML = '<p>On-road: <strong class="price big">' + esc(r.total) + '</strong></p>' + r.html; }).catch(function (e) { out.innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  Promise.all([S.api('/api/admin/variants'), S.api('/api/admin/cities'), S.api('/api/admin/models')]).then(function (a) {
    variants = S.items(a[0]); cities = S.items(a[1]); models = S.items(a[2]);
    $('#pc-var').innerHTML = S.opts(variants.map(function (v) { return [v.id, S.refName('models', v.model_id, models) + ' ' + v.name]; }), variants[0] && variants[0].id);
    $('#pc-city').innerHTML = S.opts(cities.map(function (c) { return [c.slug, c.name_en]; }), 'lucknow');
    ['#pc-var', '#pc-city', '#pc-acc'].forEach(function (s) { $(s).addEventListener('change', preview); });
    rules(); vtable(); bind($('#pr-tbl')); bind($('#vr-tbl')); preview();
  }).catch(function (e) { S.toast(S.errText(e), 1); });
  $('#pr-add').addEventListener('click', function () { S.editor('price-rules', null, function () { rules(); preview(); }); });
})();
