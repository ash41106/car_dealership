(function () {
  'use strict';
  var A = window.A, I = A.I;
  var F = A.F = {};
  F.phone = function (v) { var p = String(v || '').replace(/[\s\-()]/g, '').replace(/^\+?91/, '').replace(/^0/, ''); return /^[6-9]\d{9}$/.test(p) ? p : null; };
  function errEl(inp) { return A.$('#' + inp.id + '-e') || (inp.closest('.field') || inp.parentNode).querySelector('.err'); }
  F.setErr = function (inp, msg) {
    var e = errEl(inp); if (!e) return;
    if (msg) { e.textContent = msg; e.hidden = false; inp.setAttribute('aria-invalid', 'true'); } else { e.hidden = true; e.textContent = ''; inp.removeAttribute('aria-invalid'); }
  };
  F.check = function (inp) {
    var v = (inp.value || '').trim(), m = '';
    if (inp.type === 'checkbox') { if (inp.required && !inp.checked) m = I.err_consent; }
    else if (inp.name === 'name') { if (v.length < 2 || v.length > 80) m = I.err_name; }
    else if (inp.name === 'phone') { if (!F.phone(v)) m = I.err_phone; }
    else if (inp.name === 'email') { if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) m = I.err_email; }
    else if (inp.required && !v) m = I.err_required;
    F.setErr(inp, m); return !m;
  };
  F.validate = function (scope) {
    var bad = null;
    A.$$('input,select,textarea', scope).forEach(function (i) {
      if (i.type === 'hidden' || i.type === 'radio' || i.disabled || i.type === 'range') return;
      if (!F.check(i) && !bad) bad = i;
    });
    if (bad) bad.focus(); return !bad;
  };
  F.live = function (form) {
    form.addEventListener('blur', function (e) { var t = e.target; if (t.matches && t.matches('input,select,textarea') && t.type !== 'hidden' && t.type !== 'radio') F.check(t); }, true);
    form.addEventListener('input', function (e) { var t = e.target; if (t.getAttribute && t.getAttribute('aria-invalid')) F.check(t); });
    form.addEventListener('change', function (e) { var t = e.target; if (t.type === 'checkbox' && t.getAttribute('aria-invalid')) F.check(t); });
  };
  F.msg = function (form, text, cls) { var m = A.$('.form-msg', form); if (m) { m.textContent = text || ''; m.className = 'form-msg ' + (cls || ''); } };
  F.serverErrors = function (form, e) {
    var shown = false, er = e && e.errors;
    if (er) {
      var list = Array.isArray(er) ? er : Object.keys(er).map(function (k) { return { field: k, message: er[k] }; });
      list.forEach(function (x) { var f = x.field || x.name; var inp = f && A.$('[name="' + f + '"]', form); if (inp && inp.type !== 'hidden') { F.setErr(inp, x.message || x.msg || String(x)); shown = true; } });
    }
    F.msg(form, (e && e.message) || I.error_generic, 'bad');
    return shown;
  };
  F.busy = function (form, on) {
    var b = A.$('[type=submit]', form); if (!b) return;
    if (on) { b.disabled = true; b.setAttribute('data-t', b.innerHTML); b.textContent = I.sending + '...'; }
    else { b.disabled = false; if (b.getAttribute('data-t')) b.innerHTML = b.getAttribute('data-t'); }
  };
  F.id = function (v) { return v !== '' && v != null && /^\d+$/.test(String(v)) ? Number(v) : v; };
  F.done = function (form, html) {
    var d = form.parentNode.querySelector('[data-done]') || document.createElement('div'); d.className = 'done'; d.hidden = false; d.setAttribute('tabindex', '-1');
    d.innerHTML = html; if (!d.parentNode) form.parentNode.appendChild(d); form.hidden = true; d.focus(); window.scrollTo({ top: d.getBoundingClientRect().top + scrollY - 120, behavior: A.RM ? 'auto' : 'smooth' });
  };
  F.consultant = function (r) { return r && r.assignee ? '<p>' + A.esc(I.your_consultant) + ': <strong>' + A.esc(r.assignee.name) + '</strong></p>' : ''; };

  A.$$('form[data-lead]').forEach(function (form) {
    F.live(form);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (!F.validate(form)) return;
      var f = function (n) { var e = form.elements[n]; return e ? e.value.trim() : ''; };
      var body = { source: f('source') || 'website', type: f('type'), name: f('name'), phone: F.phone(f('phone')), email: f('email') || undefined, message: f('message') || undefined, consent: true, lang: A.lang };
      ['modelId', 'usedId', 'variantId'].forEach(function (k) { if (f(k)) body[k] = F.id(f(k)); });
      var ti = {}, any = false; A.$$('[name^=ti_]', form).forEach(function (i) { if (i.value.trim()) { ti[i.name.slice(3)] = i.type === 'number' ? Number(i.value) : i.value.trim(); any = true; } });
      if (any) body.tradeIn = ti;
      F.busy(form, true); F.msg(form, '');
      A.post('/api/leads', body).then(function (r) {
        F.done(form, '<h2 class="h2">' + A.esc(I.thanks) + '<span class="dot">.</span></h2><p class="lead" style="margin-inline:auto">' + A.esc(I.thanks_lead) + '</p>' + F.consultant(r));
      }).catch(function (e) { F.busy(form, false); F.serverErrors(form, e); });
    });
  });

  A.$$('form[data-cb]').forEach(function (form) {
    F.live(form);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (!F.validate(form)) return;
      var g = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ''; };
      F.busy(form, true);
      A.post('/api/service/callback', { name: g('name'), phone: F.phone(g('phone')), reason: g('reason') || undefined, preferred_time: g('preferred_time') || undefined, consent: true, lang: A.lang }).then(function () {
        F.done(form, '<h2 class="h3">' + A.esc(I.thanks) + '</h2><p>' + A.esc(I.thanks_lead) + '</p>');
      }).catch(function (e) { F.busy(form, false); F.serverErrors(form, e); });
    });
  });

  var oo = A.$('form[data-optout]');
  if (oo) {
    F.live(oo);
    oo.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (!F.validate(oo)) return;
      F.busy(oo, true);
      A.post('/api/opt-out', { phone: F.phone(oo.elements.phone.value) }).then(function () { F.busy(oo, false); F.msg(oo, I.optout_done, 'good'); })
        .catch(function (e) { F.busy(oo, false); F.serverErrors(oo, e); });
    });
  }
})();

(function () {
  var A = window.A, p = null; try { p = JSON.parse(localStorage.getItem('cust') || 'null'); } catch (e) { }
  if (!p) return;
  A.$$('form input[name=name],form input[name=phone],form input[name=email]').forEach(function (i) { if (!i.value && p[i.name] && !i.closest('[data-optout]')) i.value = p[i.name]; });
})();
