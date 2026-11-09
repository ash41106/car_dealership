(function () {
  'use strict';
  var A = window.A, I = A.I, F = A.F;
  if (!F) return;
  function slotsLoader(form, urlFn, render) {
    var box = A.$('[data-slots]', form), hid = form.elements.time, seq = 0, poll = false;
    form._poll = function () { poll = true; };
    return function () {
      var u = urlFn(); if (!poll) hid.value = ''; poll = false;
      if (!u) { box.innerHTML = ''; return; }
      var n = ++seq; box.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; box.setAttribute('aria-busy', 'true');
      A.json(u).then(function (r) {
        if (n !== seq) return; box.removeAttribute('aria-busy');
        var list = Array.isArray(r) ? r : (r.slots || r.items || []);
        if (!list.length) { box.innerHTML = '<p class="muted">' + A.esc(I.no_slots) + '</p>'; return; }
        var keep = hid.value; box.innerHTML = list.map(function (s, i) { return render(s, i).replace('<label class="slot">', '<label class="slot" style="--i:' + i + '">'); }).join(''); if (keep) { var again = A.$('input[value="' + keep + '"]', box); if (again && !again.disabled) { again.checked = true; hid.value = keep; } else hid.value = ''; }
      }).catch(function () { if (n !== seq) return; box.removeAttribute('aria-busy'); box.innerHTML = '<p class="err" role="alert">' + A.esc(I.error_generic) + ' <button type="button" class="btn btn-sm btn-o" data-retry>' + A.esc(I.retry) + '</button></p>'; A.$('[data-retry]', box).onclick = function () { form._reload(); }; });
    };
  }
  // 'today' and 'now' in Lucknow time (IST), independent of the visitor's timezone
  function istNow() { var n = new Date(Date.now() + 19800000).toISOString(); return { date: n.slice(0, 10), time: n.slice(11, 16) }; }
  function isPast(date, time) { var n = istNow(); return date < n.date || (date === n.date && time <= n.time); }
  function slotHtml(time, disabled, sub, extra) {
    return '<label class="slot"><input type="radio" name="slot" value="' + A.esc(time) + '"' + (disabled ? ' disabled' : '') + (extra || '') + '><span>' + A.esc(time) + '<small>' + A.esc(sub) + '</small></span></label>';
  }
  function bindSlotPick(form) {
    form.addEventListener('change', function (e) { if (e.target.name === 'slot') { form.elements.time.value = e.target.value; var er = A.$('[data-slots]', form).parentNode.querySelector('.err'); if (er) { er.hidden = true; } } });
  }
  function conflict(form, e) { if (e.status === 409) { F.msg(form, I.slot_conflict, 'bad'); form._reload && form._reload(); return true; } return false; }

  // ---- confirmation ticket: the chosen date chip morphs into the ticket's date block (View Transitions where supported) ----
  function ticket(form, o) {
    var b = o.body, dt = new Date(b.date + 'T' + b.time + ':00+05:30'), loc = A.lang === 'hi' ? 'hi-IN' : 'en-IN', IST = { timeZone: 'Asia/Kolkata' }, day = +dt.toLocaleDateString('en-GB', Object.assign({ day: 'numeric' }, IST)), mon = dt.toLocaleDateString(loc, Object.assign({ month: 'short' }, IST)), nice = dt.toLocaleDateString(loc, Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, IST)) + ', ' + b.time;
    var td = o.kind === 'td', title = td ? I.tk_td : I.tk_sv, where, what;
    if (td) { var sh = A.$('[name=showroomId]:checked', form), md = A.$('[name=modelId]:checked', form); where = sh ? A.$('.opt-in b', sh.closest('.opt')).textContent : ''; what = md ? A.$('.opt-in b', md.closest('.opt')).textContent : ''; }
    else { var wk2 = A.$('[name=workshopId]:checked', form); where = wk2 ? A.$('.opt-in b', wk2.closest('.opt')).textContent : ''; what = (b.model || '') + (b.regNo ? ' ' + b.regNo : ''); }
    var who = o.r && o.r.assignee ? o.r.assignee.name + (o.r.assignee.phone ? ' (' + o.r.assignee.phone + ')' : '') : '';
    var utc = function (d2) { return d2.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    var esc2 = function (t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    var fold = function (line) { var out = [], bytes = 0, cur = ''; for (var ch of line) { var n = new TextEncoder().encode(ch).length; if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; } cur += ch; bytes += n; } out.push(cur); return out.join('\r\n '); };
    var end = new Date(dt.getTime() + (td ? 45 : 90) * 60000);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Company A Motors//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '@companya-motors', 'DTSTAMP:' + utc(new Date()), 'DTSTART:' + utc(dt), 'DTEND:' + utc(end), 'SUMMARY:' + esc2(title + ': ' + what + ' - Company A Motors'), 'LOCATION:' + esc2(where + ', Lucknow'), 'DESCRIPTION:' + esc2(title + ' booked on the Company A Motors website.\nPlease arrive 10 minutes early.'), 'END:VEVENT', 'END:VCALENDAR'];
    var ics = lines.map(fold).join('\r\n') + '\r\n';
    var href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), wa = 'https://wa.me/?text=' + encodeURIComponent(title + ': ' + what + ' - ' + where + ', ' + nice);
    var html = '<div class="ticket" role="status"><div class="tk-top"><span class="tk-date" style="view-transition-name:tkdate"><b>' + day + '</b><small>' + A.esc(mon) + '</small></span><div><h2>' + A.esc(I.tk_t) + '</h2><p>' + A.esc(title + (what ? ': ' + what : '')) + '</p></div><svg class="tk-tick" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><path d="M13 23l7 7 12-15"/></svg></div><div class="tk-body"><dl><dt>' + A.esc(I.tk_where) + '</dt><dd>' + A.esc(where) + '</dd><dt>' + A.esc(I.tk_when) + '</dt><dd>' + A.esc(nice) + '</dd>' + (who ? '<dt>' + A.esc(I.tk_who) + '</dt><dd>' + A.esc(who) + '</dd>' : '') + '</dl><div class="tk-act"><a class="btn" download="company-a-booking.ics" href="' + href + '">' + A.esc(I.tk_cal) + '</a><a class="btn btn-o" target="_blank" rel="noopener" href="' + wa + '">' + A.esc(I.tk_wa) + '</a></div><div class="tk-todo"><h3>' + A.esc(I.tk_bring) + '</h3><ul style="list-style:none;margin:0;padding:0;display:grid;gap:.3rem">' + (td ? '<li>' + A.esc(I.tk_b1) + '</li><li>' + A.esc(I.tk_b2) + '</li><li>' + A.esc(I.tk_b3) + '</li>' : '<li>' + A.esc(I.tk_s1) + '</li><li>' + A.esc(I.tk_s2) + '</li><li>' + A.esc(I.tk_s3) + '</li>') + '</ul></div></div></div>';
    var chip = A.$('[name=date]:checked', form); chip = chip && chip.nextElementSibling;
    var swap = function () { F.done(form, html); A.$$('.tk-todo li').forEach(function (l) { l.style.listStyle = 'none'; }); };
    if (!A.RM && chip && document.startViewTransition) { chip.style.viewTransitionName = 'tkdate'; document.startViewTransition(swap); } else swap();
    if (!A.RM && navigator.vibrate) navigator.vibrate(30);
  }

  // ---- test drive stepper ----
  var td = A.$('form[data-td]');
  if (td) {
    F.live(td); bindSlotPick(td);
    var step = 1, panels = A.$$('.panel', td), lis = A.$$('.steps li', td), back = A.$('[data-back]', td), next = A.$('[data-next]', td), sub = A.$('[data-submit]', td);
    var val = function (n) { var c = A.$('[name=' + n + ']:checked', td); return c ? c.value : ''; };
    var load = slotsLoader(td, function () { var m = val('modelId'), s = val('showroomId'), d = td.elements.date.value; return m && s && d ? '/api/slots/test-drive?showroom=' + encodeURIComponent(s) + '&model=' + encodeURIComponent(m) + '&date=' + encodeURIComponent(d) : ''; },
      function (s) { var past = isPast(td.elements.date.value, s.time); return slotHtml(s.time, !s.available || past, s.available && !past ? '' : (past ? I.slot_passed : I.slot_taken), s.demoCarId ? ' data-car="' + A.esc(s.demoCarId) + '"' : ''); });
    td._reload = load; td.addEventListener('change', function (e) { if (e.target.name === 'date') load(); });
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
        ticket(td, { kind: 'td', body: body, r: r });
      }).catch(function (e) { F.busy(td, false); if (conflict(td, e)) { step = 3; show(); return; } F.serverErrors(td, e); });
    });
    // preselected model from ?model=
    if (val('modelId')) { step = 2; show(); }
    setInterval(function () { if (!document.hidden && step === 3) { td._poll(); load(); } }, 20000);
  }

  // ---- service ----
  var sv = A.$('form[data-sv]');
  if (sv) {
    F.live(sv); bindSlotPick(sv);
    var wk = function () { var c = A.$('[name=workshopId]:checked', sv); return c ? c.value : ''; };
    var ld = slotsLoader(sv, function () { var w = wk(), d = sv.elements.date.value; return w && d ? '/api/slots/service?workshop=' + encodeURIComponent(w) + '&date=' + encodeURIComponent(d) : ''; },
      function (s) { var past = isPast(sv.elements.date.value, s.time), full = !(s.remaining > 0); return slotHtml(s.time, full || past, past ? I.slot_passed : full ? I.full : s.remaining + ' ' + I.remaining); });
    setInterval(function () { if (!document.hidden && sv.elements.time && A.$('[data-slots] .slot', sv)) { sv._poll(); ld(); } }, 20000);
    sv._reload = ld; sv.addEventListener('change', function (e) { if (e.target.name === 'date') ld(); }); A.$$('[name=workshopId]', sv).forEach(function (r) { r.addEventListener('change', ld); });
    sv.addEventListener('submit', function (ev) {
      ev.preventDefault(); var okf = F.validate(sv), er = A.$('[name=workshopId]', sv).closest('.field').querySelector('.err');
      if (!wk()) { er.textContent = I.err_required; er.hidden = false; okf = false; } else er.hidden = true;
      if (!sv.elements.time.value) { var e2 = A.$('[data-slots]', sv).parentNode.querySelector('.err'); e2.textContent = I.choose_slot; e2.hidden = false; okf = false; }
      if (!okf) return;
      var g = function (n) { return sv.elements[n].value.trim(); };
      var body = { name: g('name'), phone: F.phone(g('phone')), regNo: g('regNo').toUpperCase(), model: g('model'), workshopId: F.id(wk()), date: g('date'), time: g('time'), serviceType: g('serviceType'), pickupDrop: sv.elements.pickupDrop.checked, notes: g('notes') || undefined, consent: true, lang: A.lang };
      F.busy(sv, true); F.msg(sv, '');
      A.post('/api/service', body).then(function () {
        ticket(sv, { kind: 'sv', body: body });
      }).catch(function (e) { F.busy(sv, false); if (conflict(sv, e)) return; F.serverErrors(sv, e); });
    });
  }
})();
(function () {
  var A = window.A, sv = A.$('form[data-sv]'); if (!sv) return;
  var q = new URLSearchParams(location.search);
  if (q.get('reg') && sv.elements.regNo) sv.elements.regNo.value = q.get('reg');
  if (q.get('model') && sv.elements.model) { var o = A.$$('option', sv.elements.model).filter(function (x) { return x.value.toLowerCase() === q.get('model').toLowerCase(); })[0]; if (o) sv.elements.model.value = o.value; }
})();
