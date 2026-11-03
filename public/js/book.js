(function () {
  'use strict';
  var A = window.A, I = A.I, F = A.F;
  if (!F) return;
  function slotsLoader(form, urlFn, render) {
    var box = A.$('[data-slots]', form), hid = form.elements.time, seq = 0;
    return function () {
      var u = urlFn(); hid.value = '';
      if (!u) { box.innerHTML = ''; return; }
      var n = ++seq; box.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; box.setAttribute('aria-busy', 'true');
      A.json(u).then(function (r) {
        if (n !== seq) return; box.removeAttribute('aria-busy');
        var list = Array.isArray(r) ? r : (r.slots || r.items || []);
        if (!list.length) { box.innerHTML = '<p class="muted">' + A.esc(I.no_slots) + '</p>'; return; }
        box.innerHTML = list.map(function (s, i) { return render(s, i); }).join('');
      }).catch(function () { if (n !== seq) return; box.removeAttribute('aria-busy'); box.innerHTML = '<p class="err" role="alert">' + A.esc(I.error_generic) + ' <button type="button" class="btn btn-sm btn-o" data-retry>' + A.esc(I.retry) + '</button></p>'; A.$('[data-retry]', box).onclick = function () { form._reload(); }; });
    };
  }
  function slotHtml(time, disabled, sub, extra) {
    return '<label class="slot"><input type="radio" name="slot" value="' + A.esc(time) + '"' + (disabled ? ' disabled' : '') + (extra || '') + '><span>' + A.esc(time) + '<small>' + A.esc(sub) + '</small></span></label>';
  }
  function bindSlotPick(form) {
    form.addEventListener('change', function (e) { if (e.target.name === 'slot') { form.elements.time.value = e.target.value; var er = A.$('[data-slots]', form).parentNode.querySelector('.err'); if (er) { er.hidden = true; } } });
  }
  function conflict(form, e) { if (e.status === 409) { F.msg(form, I.slot_conflict, 'bad'); form._reload && form._reload(); return true; } return false; }

  // ---- test drive stepper ----
  var td = A.$('form[data-td]');
  if (td) {
    F.live(td); bindSlotPick(td);
    var step = 1, panels = A.$$('.panel', td), lis = A.$$('.steps li', td), back = A.$('[data-back]', td), next = A.$('[data-next]', td), sub = A.$('[data-submit]', td);
    var val = function (n) { var c = A.$('[name=' + n + ']:checked', td); return c ? c.value : ''; };
    var load = slotsLoader(td, function () { var m = val('modelId'), s = val('showroomId'), d = td.elements.date.value; return m && s && d ? '/api/slots/test-drive?showroom=' + encodeURIComponent(s) + '&model=' + encodeURIComponent(m) + '&date=' + encodeURIComponent(d) : ''; },
      function (s) { return slotHtml(s.time, !s.available, s.available ? '' : I.slot_taken, s.demoCarId ? ' data-car="' + A.esc(s.demoCarId) + '"' : ''); });
    td._reload = load; td.elements.date.addEventListener('change', load);
    function show() {
      panels.forEach(function (p, i) { p.hidden = i + 1 !== step; }); lis.forEach(function (l, i) { l.classList.toggle('on', i + 1 === step); l.classList.toggle('done', i + 1 < step); if (i + 1 === step) l.setAttribute('aria-current', 'step'); else l.removeAttribute('aria-current'); });
      back.hidden = step === 1; next.hidden = step === 4; sub.hidden = step !== 4; if (step === 3) load();
      var h = panels[step - 1].querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    function ok() {
      var p = panels[step - 1], er = A.$('.err', p);
      if (step === 1 && !val('modelId')) { er.textContent = I.err_required; er.hidden = false; return false; }
      if (step === 2 && !val('showroomId')) { er.textContent = I.err_required; er.hidden = false; return false; }
      if (step === 3) { if (!td.elements.date.value || !td.elements.time.value) { er = A.$('[data-slots]', td).parentNode.querySelector('.err'); er.textContent = I.choose_slot; er.hidden = false; return false; } }
      if (er) er.hidden = true; return true;
    }
    next.addEventListener('click', function () { if (ok()) { step++; show(); } });
    back.addEventListener('click', function () { step--; show(); });
    A.$$('[name=modelId],[name=showroomId]', td).forEach(function (r) { r.addEventListener('change', function () { td.elements.time.value = ''; }); });
    td.addEventListener('submit', function (ev) {
      ev.preventDefault(); if (step < 4) { next.click(); return; }
      if (!F.validate(A.$('[data-step="4"]', td))) return;
      var body = { name: td.elements.name.value.trim(), phone: F.phone(td.elements.phone.value), email: td.elements.email.value.trim() || undefined, showroomId: F.id(val('showroomId')), modelId: F.id(val('modelId')), date: td.elements.date.value, time: td.elements.time.value, consent: true, lang: A.lang };
      F.busy(td, true); F.msg(td, '');
      A.post('/api/test-drive', body).then(function (r) {
        F.done(td, '<h2 class="h2">' + A.esc(I.booking_done) + '<span class="dot">.</span></h2><p class="lead" style="margin-inline:auto">' + A.esc(body.date + ' · ' + body.time) + '</p>' + F.consultant(r));
      }).catch(function (e) { F.busy(td, false); if (conflict(td, e)) { step = 3; show(); return; } F.serverErrors(td, e); });
    });
    // preselected model from ?model=
    if (val('modelId')) { step = 2; show(); }
  }

  // ---- service ----
  var sv = A.$('form[data-sv]');
  if (sv) {
    F.live(sv); bindSlotPick(sv);
    var wk = function () { var c = A.$('[name=workshopId]:checked', sv); return c ? c.value : ''; };
    var ld = slotsLoader(sv, function () { var w = wk(), d = sv.elements.date.value; return w && d ? '/api/slots/service?workshop=' + encodeURIComponent(w) + '&date=' + encodeURIComponent(d) : ''; },
      function (s) { var full = !(s.remaining > 0); return slotHtml(s.time, full, full ? I.full : s.remaining + ' ' + I.remaining); });
    sv._reload = ld; sv.elements.date.addEventListener('change', ld); A.$$('[name=workshopId]', sv).forEach(function (r) { r.addEventListener('change', ld); });
    sv.addEventListener('submit', function (ev) {
      ev.preventDefault(); var okf = F.validate(sv), er = A.$('[name=workshopId]', sv).closest('.field').querySelector('.err');
      if (!wk()) { er.textContent = I.err_required; er.hidden = false; okf = false; } else er.hidden = true;
      if (!sv.elements.time.value) { var e2 = A.$('[data-slots]', sv).parentNode.querySelector('.err'); e2.textContent = I.choose_slot; e2.hidden = false; okf = false; }
      if (!okf) return;
      var g = function (n) { return sv.elements[n].value.trim(); };
      var body = { name: g('name'), phone: F.phone(g('phone')), regNo: g('regNo').toUpperCase(), model: g('model'), workshopId: F.id(wk()), date: g('date'), time: g('time'), serviceType: g('serviceType'), pickupDrop: sv.elements.pickupDrop.checked, notes: g('notes') || undefined, consent: true, lang: A.lang };
      F.busy(sv, true); F.msg(sv, '');
      A.post('/api/service', body).then(function () {
        F.done(sv, '<h2 class="h2">' + A.esc(I.booking_done) + '<span class="dot">.</span></h2><p class="lead" style="margin-inline:auto">' + A.esc(body.date + ' · ' + body.time) + '</p>');
      }).catch(function (e) { F.busy(sv, false); if (conflict(sv, e)) return; F.serverErrors(sv, e); });
    });
  }
})();
