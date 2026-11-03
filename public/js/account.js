(function () {
  'use strict';
  var A = window.A, F = A.F, root = A.$('#acc'), hi = A.lang === 'hi';
  var T = {
    en: { title: 'My account', sub: 'Sign in with your mobile number. We will send a one-time code.', phone: 'Mobile number', send: 'Send code', otp: '6-digit code', name: 'Your name (new accounts)', verify: 'Verify and sign in', dev: 'Demo mode: your code is', dev2: 'You can also use 123456.', bookings: 'My bookings', vehicles: 'My vehicles', saved: 'Saved cars', enq: 'Enquiries', profile: 'Profile and privacy', none: 'Nothing here yet.', cancel: 'Cancel booking', cancelled: 'Booking cancelled.', confirmQ: 'Cancel this booking?', td: 'Test drive', sv: 'Service', add: 'Add vehicle', reg: 'Registration number', model: 'Model', year: 'Year', km: 'Km', bookSv: 'Book service', del: 'Remove', signout: 'Sign out', save: 'Save', email: 'Email', lang: 'Language', export: 'Download my data', delete: 'Delete my data', withdraw: 'Withdraw consent', exportDone: 'Your data file is downloading.', reqDone: 'Request received. Our team will process it.', delQ: 'Request deletion of your data? Our team will confirm by phone.', wdQ: 'Withdraw consent? We will stop messages to you.', saved2: 'Saved.', hello: 'Hello', signinPrompt: 'Sign in to keep saved cars on all your devices.', view: 'View', status: 'Status', err: 'Something went wrong. Please try again.', rights: 'Your data rights (DPDP Act)', addOk: 'Vehicle added.', rm: 'Removed.', open: 'Open', consultant: 'Consultant' },
    hi: { title: 'मेरा खाता', sub: 'मोबाइल नंबर से साइन इन करें। हम एक बार का कोड भेजेंगे।', phone: 'मोबाइल नंबर', send: 'कोड भेजें', otp: '6 अंकों का कोड', name: 'आपका नाम (नए खाते के लिए)', verify: 'सत्यापित करें और साइन इन', dev: 'डेमो मोड: आपका कोड है', dev2: 'आप 123456 भी उपयोग कर सकते हैं।', bookings: 'मेरी बुकिंग', vehicles: 'मेरी गाड़ियाँ', saved: 'सेव की गई कारें', enq: 'पूछताछ', profile: 'प्रोफ़ाइल और गोपनीयता', none: 'अभी कुछ नहीं है।', cancel: 'बुकिंग रद्द करें', cancelled: 'बुकिंग रद्द हो गई।', confirmQ: 'यह बुकिंग रद्द करें?', td: 'टेस्ट ड्राइव', sv: 'सर्विस', add: 'गाड़ी जोड़ें', reg: 'रजिस्ट्रेशन नंबर', model: 'मॉडल', year: 'वर्ष', km: 'किमी', bookSv: 'सर्विस बुक करें', del: 'हटाएँ', signout: 'साइन आउट', save: 'सेव करें', email: 'ईमेल', lang: 'भाषा', export: 'मेरा डेटा डाउनलोड करें', delete: 'मेरा डेटा मिटाएँ', withdraw: 'सहमति वापस लें', exportDone: 'आपकी डेटा फ़ाइल डाउनलोड हो रही है।', reqDone: 'अनुरोध मिल गया। हमारी टीम इसे पूरा करेगी।', delQ: 'अपना डेटा मिटाने का अनुरोध करें? हमारी टीम फ़ोन पर पुष्टि करेगी।', wdQ: 'सहमति वापस लें? हम आपको संदेश भेजना बंद कर देंगे।', saved2: 'सेव हो गया।', hello: 'नमस्ते', signinPrompt: 'सेव की गई कारें सभी डिवाइस पर रखने के लिए साइन इन करें।', view: 'देखें', status: 'स्थिति', err: 'कुछ गलत हुआ। कृपया फिर कोशिश करें।', rights: 'आपके डेटा अधिकार (DPDP अधिनियम)', addOk: 'गाड़ी जोड़ दी गई।', rm: 'हटा दिया।', open: 'खोलें', consultant: 'कंसल्टेंट' }
  }[hi ? 'hi' : 'en'];
  var e = A.esc, tab = 'bookings', me = null, cache = {};
  function msg(t, bad) { var m = A.$('#acc-msg'); if (m) { m.textContent = t || ''; m.className = 'form-msg ' + (bad ? 'bad' : t ? 'good' : ''); } }
  function fail(x) { msg((x && x.message) || T.err, true); }
  function remember(c) { try { localStorage.setItem('cust', JSON.stringify({ name: c.name || '', phone: c.phone || '', email: c.email || '' })); } catch (x) { } }

  function signin() {
    root.innerHTML = '<div class="narrow"><p class="lead" style="margin-top:0">' + e(T.sub) + '</p><form class="form" id="f1" novalidate><div class="field"><label for="s-ph">' + e(T.phone) + '</label><input id="s-ph" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="16" required aria-describedby="s-ph-e"><p class="err" id="s-ph-e" role="alert" hidden></p></div><div class="form-msg" role="status" aria-live="polite" id="acc-msg"></div><button class="btn" type="submit">' + e(T.send) + '</button></form><form class="form" id="f2" novalidate hidden><div id="dev"></div><div class="field"><label for="s-otp">' + e(T.otp) + '</label><input id="s-otp" name="otp" class="otp-i" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required aria-describedby="s-otp-e"><p class="err" id="s-otp-e" role="alert" hidden></p></div><div class="field"><label for="s-nm">' + e(T.name) + '</label><input id="s-nm" name="name" autocomplete="name" maxlength="80"></div><button class="btn" type="submit">' + e(T.verify) + '</button></form></div>';
    var f1 = A.$('#f1'), f2 = A.$('#f2');
    f1.addEventListener('submit', function (ev) {
      ev.preventDefault(); var ph = F.phone(f1.elements.phone.value); if (!ph) { F.setErr(f1.elements.phone, A.I.err_phone); return; } F.setErr(f1.elements.phone, '');
      A.post('/api/customer/otp/request', { phone: ph, lang: A.lang }).then(function (r) { f1.hidden = true; f2.hidden = false; if (r.dev_otp) A.$('#dev').innerHTML = '<p class="devhint">' + e(T.dev) + ' <b>' + e(r.dev_otp) + '</b>. ' + e(T.dev2) + '</p>'; f2.elements.otp.focus(); f2._ph = ph; })
        .catch(function (x) { F.setErr(f1.elements.phone, x.message); });
    });
    f2.addEventListener('submit', function (ev) {
      ev.preventDefault(); var code = f2.elements.otp.value.trim(); if (!/^\d{6}$/.test(code)) { F.setErr(f2.elements.otp, T.otp); return; } F.setErr(f2.elements.otp, '');
      A.post('/api/customer/otp/verify', { phone: f2._ph, otp: code, name: f2.elements.name.value.trim() || undefined }).then(function (r) { remember(r.customer); try { localStorage.setItem('custName', r.customer.name || ''); } catch (x) { } syncSaved().then(boot); })
        .catch(function (x) { F.setErr(f2.elements.otp, x.message); });
    });
  }
  function syncSaved() {
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('saved') || '{}'); } catch (x) { }
    return Promise.all(Object.keys(saved).map(function (k) { return A.post('/api/customer/saved', { kind: /^uc-/.test(k) ? 'used' : 'new', ref: k }).catch(function () { }); }));
  }
  function api(p, m, b) { return b === undefined && (!m || m === 'GET') ? A.json('/api/customer/' + p) : A.post('/api/customer/' + p, b, m); }
  function stat(s) { return '<span class="chip">' + e(String(s).replace('_', ' ')) + '</span>'; }

  var views = {
    bookings: function (box) {
      api('bookings').then(function (r) {
        var it = Array.isArray(r) ? r : (r.items || []);
        box.innerHTML = it.length ? '<div class="stack">' + it.map(function (b) { return '<div class="acard"><div><strong>' + e(b.type === 'service' ? T.sv : T.td) + ' &middot; ' + e(b.date) + ' ' + e(b.time) + '</strong><br><small class="muted">' + e(b.model || b.model_name || '') + ' ' + e(b.showroom_name || b.workshop_name || '') + '</small></div><div>' + stat(b.status) + (b.can_change || b.can_cancel ? ' <button class="btn btn-sm btn-o" data-cancel="' + e(b.id) + '" type="button">' + e(T.cancel) + '</button>' : '') + '</div></div>'; }).join('') + '</div>' : '<p class="empty">' + e(T.none) + '</p>';
        box.onclick = function (ev) { var b = ev.target.closest('[data-cancel]'); if (b && confirm(T.confirmQ)) A.post('/api/customer/bookings/' + b.getAttribute('data-cancel') + '/cancel', {}).then(function () { msg(T.cancelled); views.bookings(box); }).catch(fail); };
      }).catch(fail);
    },
    vehicles: function (box) {
      api('vehicles').then(function (r) {
        var it = Array.isArray(r) ? r : (r.items || []);
        box.innerHTML = '<div class="stack">' + (it.length ? it.map(function (v) { return '<div class="acard"><div><strong>' + e(v.reg_no) + '</strong><br><small class="muted">' + e([v.model, v.year, v.km ? v.km + ' ' + T.km : ''].filter(Boolean).join(' &middot; ')) + '</small></div><div><a class="btn btn-sm" href="/service?reg=' + encodeURIComponent(v.reg_no) + '&amp;model=' + encodeURIComponent(v.model || '') + '">' + e(T.bookSv) + '</a> <button class="btn btn-sm btn-o" type="button" data-del="' + e(v.id) + '">' + e(T.del) + '</button></div></div>'; }).join('') : '<p class="empty">' + e(T.none) + '</p>') + '</div>' +
          '<h3 class="h3 mt">' + e(T.add) + '</h3><form class="form" id="vf" novalidate><div class="row2"><div class="field"><label for="v-reg">' + e(T.reg) + '</label><input id="v-reg" name="reg_no" required maxlength="14" aria-describedby="v-reg-e"><p class="err" id="v-reg-e" role="alert" hidden></p></div><div class="field"><label for="v-m">' + e(T.model) + '</label><input id="v-m" name="model" maxlength="60"></div></div><div class="row2"><div class="field"><label for="v-y">' + e(T.year) + '</label><input id="v-y" name="year" type="number" min="1990"></div><div class="field"><label for="v-k">' + e(T.km) + '</label><input id="v-k" name="km" type="number" min="0"></div></div><button class="btn" type="submit">' + e(T.add) + '</button></form>';
        box.onclick = function (ev) { var b = ev.target.closest('[data-del]'); if (b) A.json('/api/customer/vehicles/' + b.getAttribute('data-del'), { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } }).then(function () { msg(T.rm); views.vehicles(box); }).catch(fail); };
        A.$('#vf').onsubmit = function (ev) { ev.preventDefault(); var f = ev.target, g = function (n) { return f.elements[n].value.trim(); }; if (!g('reg_no')) { F.setErr(f.elements.reg_no, A.I.err_required); return; }
          A.post('/api/customer/vehicles', { reg_no: g('reg_no'), model: g('model') || undefined, year: g('year') || undefined, km: g('km') || undefined }).then(function () { msg(T.addOk); views.vehicles(box); }).catch(function (x) { F.setErr(f.elements.reg_no, x.errors && x.errors.reg_no || x.message); }); };
      }).catch(fail);
    },
    saved: function (box) {
      api('saved').then(function (r) {
        var it = Array.isArray(r) ? r : (r.items || []);
        box.innerHTML = it.length ? '<div class="stack">' + it.map(function (s) { var i = s.item || {}, url = s.kind === 'used' ? '/used-cars/' + s.ref : '/new-cars/' + s.ref; return '<div class="acard"><div><strong>' + e(i.title || i.name || s.ref) + '</strong><br><small class="muted">' + e(i.price || i.from_price ? A.inr(i.price || i.from_price) : '') + '</small></div><div><a class="btn btn-sm" href="' + e(url) + '">' + e(T.view) + '</a> <button class="btn btn-sm btn-o" type="button" data-un="' + e(s.kind + '|' + s.ref) + '">' + e(T.del) + '</button></div></div>'; }).join('') + '</div>' : '<p class="empty">' + e(T.none) + '</p>';
        box.onclick = function (ev) { var b = ev.target.closest('[data-un]'); if (!b) return; var p = b.getAttribute('data-un').split('|'); A.json('/api/customer/saved?kind=' + p[0] + '&ref=' + encodeURIComponent(p[1]), { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } }).then(function () { try { var sv = JSON.parse(localStorage.getItem('saved') || '{}'); delete sv[p[1]]; localStorage.setItem('saved', JSON.stringify(sv)); } catch (x) { } views.saved(box); }).catch(fail); };
      }).catch(fail);
    },
    enq: function (box) {
      api('enquiries').then(function (r) {
        var it = Array.isArray(r) ? r : (r.items || []);
        box.innerHTML = it.length ? '<div class="stack">' + it.map(function (l) { return '<div class="acard"><div><strong>' + e(l.model || l.type) + '</strong> ' + stat(l.status) + '<br><small class="muted">' + e((l.created_at || '').slice(0, 10)) + (l.assignee_name ? ' &middot; ' + e(T.consultant) + ': ' + e(l.assignee_name) : '') + '</small></div>' + (l.assignee_phone ? '<a class="btn btn-sm btn-o" href="tel:' + e(l.assignee_phone) + '">' + e(l.assignee_phone) + '</a>' : '') + '</div>'; }).join('') + '</div>' : '<p class="empty">' + e(T.none) + '</p>';
      }).catch(fail);
    },
    profile: function (box) {
      var c = me || {};
      box.innerHTML = '<form class="form narrow" id="pf" novalidate><div class="field"><label for="p-n">' + e(A.I.name || 'Name') + '</label><input id="p-n" name="name" value="' + e(c.name || '') + '" maxlength="80"></div><div class="field"><label for="p-e">' + e(T.email) + '</label><input id="p-e" name="email" type="email" value="' + e(c.email || '') + '" aria-describedby="p-e-e"><p class="err" id="p-e-e" role="alert" hidden></p></div><div class="field"><label for="p-l">' + e(T.lang) + '</label><select id="p-l" name="lang"><option value="en"' + (c.lang === 'en' ? ' selected' : '') + '>English</option><option value="hi"' + (c.lang === 'hi' ? ' selected' : '') + '>हिन्दी</option></select></div><button class="btn" type="submit">' + e(T.save) + '</button></form>' +
        '<h3 class="h3 mt">' + e(T.rights) + '</h3><div class="cta-row"><button class="btn btn-o" type="button" data-dr="export">' + e(T.export) + '</button><button class="btn btn-o" type="button" data-dr="withdraw_consent">' + e(T.withdraw) + '</button><button class="btn btn-o" type="button" data-dr="delete">' + e(T.delete) + '</button></div><p class="muted small"><a href="/privacy">' + e(A.I.privacy || 'Privacy') + '</a></p>';
      A.$('#pf').onsubmit = function (ev) { ev.preventDefault(); var f = ev.target; A.post('/api/customer/me', { name: f.elements.name.value.trim(), email: f.elements.email.value.trim() || '', lang: f.elements.lang.value }, 'PATCH').then(function (r) { me = r.customer || r; remember(me); msg(T.saved2); if (me.lang && me.lang !== A.lang) location.href = '/account?lang=' + me.lang; }).catch(function (x) { if (x.errors && x.errors.email) F.setErr(f.elements.email, x.errors.email); else fail(x); }); };
      box.onclick = function (ev) {
        var b = ev.target.closest('[data-dr]'); if (!b) return; var k = b.getAttribute('data-dr');
        if (k === 'export') { fetch('/api/customer/export', { credentials: 'same-origin' }).then(function (r) { return r.blob(); }).then(function (bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'my-data.json'; a.click(); msg(T.exportDone); }).catch(fail); return; }
        if (!confirm(k === 'delete' ? T.delQ : T.wdQ)) return;
        A.post('/api/customer/data-request', { type: k }).then(function () { msg(T.reqDone); }).catch(fail);
      };
    }
  };
  function dash() {
    var names = [['bookings', T.bookings], ['vehicles', T.vehicles], ['saved', T.saved], ['enq', T.enq], ['profile', T.profile]];
    root.innerHTML = '<p>' + e(T.hello) + ' <strong>' + e((me && (me.name || me.phone)) || '') + '</strong> <button class="btn btn-sm btn-o" id="so" type="button">' + e(T.signout) + '</button></p><div class="tabs" role="tablist">' + names.map(function (n) { return '<button role="tab" type="button" data-t="' + n[0] + '" aria-selected="' + (n[0] === tab) + '">' + e(n[1]) + '</button>'; }).join('') + '</div><div class="form-msg" role="status" aria-live="polite" id="acc-msg"></div><div id="tab"></div>';
    var show = function () { A.$$('[data-t]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-t') === tab); }); msg(''); views[tab](A.$('#tab')); };
    A.$$('[data-t]').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-t'); show(); }; });
    A.$('#so').onclick = function () { A.post('/api/customer/logout', {}).finally(function () { try { localStorage.removeItem('cust'); localStorage.removeItem('custName'); } catch (x) { } location.reload(); }); };
    show();
  }
  function boot() {
    var flag = false; try { flag = !!localStorage.getItem('cust'); } catch (x) { }
    if (!flag) { signin(); return; }
    A.json('/api/customer/me').then(function (r) { me = r.customer || r; remember(me); try { localStorage.setItem('custName', me.name || me.phone || ''); } catch (x) { } dash(); }).catch(function () { try { localStorage.removeItem('cust'); localStorage.removeItem('custName'); } catch (x) { } signin(); });
  }
  boot();
})();
