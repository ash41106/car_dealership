(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc;
  var B = ['hatchback', 'sedan', 'suv', 'mpv'], FUEL = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'], TR = ['Manual', 'Automatic'];
  var T = function (n, l, t, o) { var f = { n: n, l: l, t: t || 'text' }; if (o) for (var k in o) f[k] = o[k]; return f; };
  var C = window.CFG = {
    models: { label: 'Model', cols: ['name', 'body_type', 'accessories_amount', 'featured', 'active'], fields: [T('name', 'Name'), T('slug', 'Slug (URL)'), T('body_type', 'Body type', 'select', { o: B }), T('tagline_en', 'Tagline (EN)'), T('tagline_hi', 'Tagline (HI)'), T('description_en', 'Description (EN)', 'area'), T('description_hi', 'Description (HI)', 'area'), T('hero_image', 'Hero image URL (blank = generated)', 'image'), T('colors', 'Colours JSON [{name_en,name_hi,hex}]', 'json'), T('gallery', 'Gallery JSON [{url,alt_en,alt_hi}]', 'json'), T('specs', 'Specs JSON', 'json'), T('highlights', 'Highlights JSON', 'json'), T('accessories_amount', 'Accessories package amount (INR)', 'number'), T('sort', 'Sort order', 'number'), T('featured', 'Featured', 'bool'), T('active', 'Active', 'bool')] },
    variants: { label: 'Variant', cols: ['model_id', 'code', 'name', 'fuel', 'transmission', 'ex_showroom', 'active'], fields: [T('model_id', 'Model', 'ref', { ref: 'models' }), T('code', 'Code'), T('name', 'Name'), T('fuel', 'Fuel', 'select', { o: FUEL }), T('transmission', 'Transmission', 'select', { o: TR }), T('ex_showroom', 'Ex-showroom (INR)', 'number'), T('features_en', 'Features EN (JSON list)', 'json'), T('features_hi', 'Features HI (JSON list)', 'json'), T('active', 'Active', 'bool')] },
    offers: { label: 'Offer', cols: ['title_en', 'model_id', 'type', 'amount', 'valid_until', 'active'], fields: [T('title_en', 'Title (EN)'), T('title_hi', 'Title (HI)'), T('body_en', 'Body (EN)', 'area'), T('body_hi', 'Body (HI)', 'area'), T('model_id', 'Model (blank = all)', 'ref', { ref: 'models', blank: 1 }), T('type', 'Type', 'select', { o: ['info', 'cash'] }), T('amount', 'Cash benefit (INR, cash type)', 'number'), T('show_in_onroad', 'Deduct in on-road breakup', 'bool'), T('valid_until', 'Valid until', 'date'), T('banner_image', 'Banner image', 'image'), T('active', 'Active', 'bool')] },
    banners: { label: 'Banner', cols: ['title_en', 'sub_en', 'cta_url', 'sort', 'active'], fields: [T('title_en', 'Title (EN)'), T('title_hi', 'Title (HI)'), T('sub_en', 'Subtitle (EN)'), T('sub_hi', 'Subtitle (HI)'), T('image', 'Image', 'image'), T('cta_label_en', 'Button label (EN)'), T('cta_label_hi', 'Button label (HI)'), T('cta_url', 'Button link'), T('sort', 'Sort', 'number'), T('active', 'Active', 'bool')] },
    showrooms: { label: 'Showroom', cols: ['name_en', 'kind', 'phone', 'is_default', 'active'], fields: [T('name_en', 'Name (EN)'), T('name_hi', 'Name (HI)'), T('slug', 'Slug'), T('kind', 'Kind', 'select', { o: ['showroom', 'yard'] }), T('address_en', 'Address (EN)', 'area'), T('address_hi', 'Address (HI)', 'area'), T('phone', 'Phone'), T('lat', 'Latitude', 'number'), T('lng', 'Longitude', 'number'), T('hours', 'Hours'), T('is_default', 'Default showroom', 'bool'), T('active', 'Active', 'bool')] },
    workshops: { label: 'Workshop', cols: ['name_en', 'bays', 'phone', 'active'], fields: [T('name_en', 'Name (EN)'), T('name_hi', 'Name (HI)'), T('slug', 'Slug'), T('address_en', 'Address (EN)', 'area'), T('address_hi', 'Address (HI)', 'area'), T('phone', 'Phone'), T('bays', 'Service bays (capacity)', 'number'), T('lat', 'Latitude', 'number'), T('lng', 'Longitude', 'number'), T('hours', 'Hours'), T('active', 'Active', 'bool')] },
    cities: { label: 'City', cols: ['name_en', 'name_hi', 'default_showroom_id', 'active'], fields: [T('name_en', 'Name (EN)'), T('name_hi', 'Name (HI)'), T('slug', 'Slug'), T('default_showroom_id', 'Default showroom', 'ref', { ref: 'showrooms', blank: 1 }), T('sort', 'Sort', 'number'), T('active', 'Active', 'bool')] },
    'demo-cars': { label: 'Demo car', cols: ['showroom_id', 'model_id', 'reg_no', 'active'], fields: [T('showroom_id', 'Showroom', 'ref', { ref: 'showrooms' }), T('model_id', 'Model', 'ref', { ref: 'models' }), T('reg_no', 'Registration'), T('active', 'Active', 'bool')] },
    users: { label: 'User', cols: ['name', 'email', 'role', 'showroom_id', 'active'], fields: [T('name', 'Name'), T('email', 'Email', 'email'), T('role', 'Role', 'select', { o: ['admin', 'used_manager', 'consultant', 'service_advisor'] }), T('phone', 'Phone'), T('showroom_id', 'Showroom', 'ref', { ref: 'showrooms', blank: 1 }), T('specialty_model_ids', 'Specialty model IDs JSON, e.g. [1,2]', 'json'), T('password', 'Password (min 8; leave blank to keep)', 'password'), T('active', 'Active', 'bool')] },
    used: { label: 'Used car', fields: [T('model', 'Model'), T('variant', 'Variant'), T('year', 'Year', 'number'), T('km', 'Km driven', 'number'), T('owners', 'Owners', 'number'), T('fuel', 'Fuel', 'select', { o: FUEL }), T('transmission', 'Transmission', 'select', { o: TR }), T('color', 'Colour'), T('price', 'Final price (INR)', 'number'), T('status', 'Status', 'select', { o: ['available', 'booked', 'sold'] }), T('reg_no', 'Registration number (stored in full, shown masked)'), T('location', 'Location'), T('highlights', 'Highlights JSON list', 'json'), T('inspection', 'Inspection JSON {sections:[{name_en,name_hi,items:[{label_en,label_hi,status:"ok"|"attention",note}]}]}', 'json'), T('photos', 'Photos JSON list of URLs', 'json'), T('warranty_en', 'Warranty (EN)'), T('warranty_hi', 'Warranty (HI)')] }
  };
  var refCache = {};
  var REFLABEL = { models: 'name', showrooms: 'name_en', cities: 'name_en', variants: 'name' };
  S.ref = function (res) { return refCache[res] || (refCache[res] = S.api('/api/admin/' + res).then(function (r) { return S.items(r); })); };
  S.refName = function (res, id, rows) { var x = (rows || []).filter(function (r) { return String(r.id) === String(id); })[0]; return x ? x[REFLABEL[res]] : (id == null ? '' : id); };
  S.upload = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { S.api('/api/admin/upload', 'POST', { dataUrl: r.result, name: file.name }).then(function (j) { res(j.url); }, rej); }; r.onerror = rej; r.readAsDataURL(file); });
  };
  // Editor dialog. opts {res, row, onSaved, title}
  S.editor = function (res, row, onSaved) {
    var cfg = C[res], dlg = $('#ed'), form = $('#ed-form'), box = $('#ed-fields'), msg = $('.form-msg', form), isNew = !row; row = row || {};
    $('#ed-t').textContent = (isNew ? 'Add ' : 'Edit ') + cfg.label.toLowerCase();
    var refs = cfg.fields.filter(function (f) { return f.t === 'ref'; });
    Promise.all(refs.map(function (f) { return S.ref(f.ref); })).then(function (lists) {
      var L = {}; refs.forEach(function (f, i) { L[f.n] = lists[i]; });
      box.innerHTML = '<div class="grid2">' + cfg.fields.map(function (f) {
        var id = 'e-' + f.n, v = row[f.n], inp, wide = f.t === 'area' || f.t === 'json' || f.t === 'image';
        if (f.t === 'bool') inp = '<label class="chk"><input type="checkbox" id="' + id + '" name="' + f.n + '"' + ((isNew ? true : v) && v !== 0 ? ' checked' : '') + '><span>' + esc(f.l) + '</span></label>';
        else {
          if (f.t === 'select') inp = '<select id="' + id + '" name="' + f.n + '">' + S.opts(f.o, v) + '</select>';
          else if (f.t === 'ref') inp = '<select id="' + id + '" name="' + f.n + '">' + S.opts(L[f.n].map(function (r) { return [r.id, r[REFLABEL[f.ref]]]; }), v, f.blank ? 'None' : 'Choose') + '</select>';
          else if (f.t === 'area') inp = '<textarea id="' + id + '" name="' + f.n + '" rows="3">' + esc(v || '') + '</textarea>';
          else if (f.t === 'json') inp = '<textarea id="' + id + '" name="' + f.n + '" rows="5" spellcheck="false">' + esc(v == null ? '' : JSON.stringify(v, null, 1)) + '</textarea>';
          else if (f.t === 'image') inp = '<input id="' + id + '" name="' + f.n + '" value="' + esc(v || '') + '"><input type="file" accept="image/png,image/jpeg,image/webp" data-up="' + f.n + '" aria-label="Upload image for ' + esc(f.l) + '">';
          else inp = '<input id="' + id + '" name="' + f.n + '" type="' + (f.t === 'number' ? 'number" step="any' : f.t) + '" value="' + esc(f.t === 'password' ? '' : (v == null ? '' : v)) + '"' + (f.t === 'password' ? ' autocomplete="new-password"' : '') + '>';
          inp = '<div class="field' + (wide ? '" style="grid-column:1/-1' : '') + '"><label for="' + id + '">' + esc(f.l) + '</label>' + inp + '<p class="err" id="' + id + '-e" role="alert" hidden></p></div>';
        }
        return f.t === 'bool' ? '<div class="field">' + inp + '</div>' : inp;
      }).join('') + '</div>';
      S.$$('[data-up]', box).forEach(function (fi) { fi.onchange = function () { if (!fi.files[0]) return; msg.textContent = 'Uploading...'; S.upload(fi.files[0]).then(function (u) { form.elements[fi.getAttribute('data-up')].value = u; msg.textContent = 'Uploaded'; }).catch(function (e) { msg.className = 'form-msg bad'; msg.textContent = S.errText(e); }); }; });
      msg.textContent = ''; msg.className = 'form-msg';
      if (!dlg.open) dlg.showModal();
    });
    S.trap(dlg);
    $('#ed-cancel').onclick = function () { dlg.close(); };
    form.onsubmit = function (e) {
      e.preventDefault(); var body = {}, jsonBad = false;
      cfg.fields.forEach(function (f) {
        var el = form.elements[f.n]; if (!el) return; var v;
        if (f.t === 'bool') v = el.checked ? 1 : 0;
        else { v = el.value.trim(); if (f.t === 'json') { if (v === '') return; try { v = JSON.parse(v); } catch (x) { var er = $('#e-' + f.n + '-e'); er.textContent = 'Invalid JSON'; er.hidden = false; jsonBad = true; return; } } else if (f.t === 'password' && v === '') return; else if (v === '' && (f.t === 'number' || f.t === 'ref' || f.t === 'date')) v = null; else if (f.t === 'ref' && v !== '') v = +v; }
        body[f.n] = v;
      });
      if (jsonBad) return;
      var b = $('[type=submit]', form); b.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Saving...';
      S.api('/api/admin/' + res + (isNew ? '' : '/' + row.id), isNew ? 'POST' : 'PUT', body).then(function (r) { b.disabled = false; dlg.close(); delete refCache[res]; S.toast('Saved'); if (onSaved) onSaved(r); })
        .catch(function (er) { b.disabled = false; msg.className = 'form-msg bad'; msg.textContent = er.message; S.$$('.err', form).forEach(function (x) { x.hidden = true; }); if (er.errors) Object.keys(er.errors).forEach(function (k) { var x = $('#e-' + k + '-e'); if (x) { x.textContent = er.errors[k]; x.hidden = false; } }); });
    };
  };
})();
