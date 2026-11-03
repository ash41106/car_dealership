(function () {
  'use strict';
  var d = document, S = window.S = { user: window.__U || null };
  S.$ = function (s, r) { return (r || d).querySelector(s); };
  S.$$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  S.esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]; }); };
  S.inr = function (n) { return n == null || n === '' ? '' : '₹' + Math.round(n).toLocaleString('en-IN'); };
  S.items = function (r) { return Array.isArray(r) ? r : (r && (r.items || r.rows || r.data)) || []; };
  S.api = function (url, method, body) {
    var o = { method: method || 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' } };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/api/auth/login') < 0) { location.href = '/staff/login?next=' + encodeURIComponent(location.pathname); throw new Error('Signed out'); }
        if (!r.ok) { var e = new Error(j.error || j.message || 'Request failed'); e.status = r.status; e.errors = j.errors; throw e; }
        return j;
      });
    });
  };
  S.toast = function (msg, bad) {
    var t = S.$('#toasts'); if (!t) return; var e = d.createElement('div'); e.className = 'toast' + (bad ? ' bad' : ''); e.textContent = msg; t.appendChild(e); setTimeout(function () { e.remove(); }, 4000);
  };
  S.errText = function (e) {
    var m = e.message || 'Error'; if (e.errors && typeof e.errors === 'object') { m += ': ' + Object.keys(e.errors).map(function (k) { return k + ' ' + e.errors[k]; }).join('; '); } return m;
  };
  S.ago = function (iso) { var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); if (s < 90) return Math.round(s) + 's'; if (s < 5400) return Math.round(s / 60) + 'm'; if (s < 129600) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; };
  S.fmtDT = function (iso) { var x = new Date(iso); return isNaN(x) ? '' : x.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  S.pretty = function (k) { return String(k).replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); };
  S.opts = function (arr, cur, blank) { return (blank ? '<option value="">' + S.esc(blank) + '</option>' : '') + arr.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + S.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + S.esc(l) + '</option>'; }).join(''); };
  var lo = S.$('#logout');
  if (lo) lo.addEventListener('click', function () { S.api('/api/auth/logout', 'POST', {}).finally(function () { location.href = '/staff/login'; }); });
  // login
  var lf = S.$('#lf');
  if (lf) lf.addEventListener('submit', function (e) {
    e.preventDefault(); var msg = S.$('.form-msg', lf), em = lf.elements.email, pw = lf.elements.password, bad = false;
    [[em, 'Enter your email'], [pw, 'Enter your password']].forEach(function (p) { var er = S.$('#' + p[0].id + '-e'); if (!p[0].value.trim()) { er.textContent = p[1]; er.hidden = false; p[0].setAttribute('aria-invalid', 'true'); bad = true; } else { er.hidden = true; p[0].removeAttribute('aria-invalid'); } });
    if (bad) return; var b = S.$('[type=submit]', lf); b.disabled = true; msg.textContent = '';
    S.api('/api/auth/login', 'POST', { email: em.value.trim(), password: pw.value }).then(function (r) {
      var home = { consultant: '/staff/leads', used_manager: '/admin/used', service_advisor: '/staff/bookings', admin: '/admin' }[r.user.role] || '/staff/leads';
      location.href = lf.getAttribute('data-next') || home;
    }).catch(function (er) { b.disabled = false; msg.className = 'form-msg bad'; msg.textContent = er.message || 'Sign in failed'; });
  });
  // generic accessible modal focus trap helper
  S.trap = function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return; var f = S.$$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', el).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return; var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); }
    });
  };
})();
