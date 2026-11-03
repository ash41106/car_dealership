(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, state = { page: 1 }, current = null, lastFocus = null, consultants = null;
  var list = $('#list'), pager = $('#pager'), fbar = $('#fbar');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(s) { s = Math.abs(Math.round(s)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function chip(l) {
    var s = l.sla || {};
    if (s.responded) return '<span class="sla ' + (s.breached ? 'r' : 'g') + '">' + (s.breached ? 'Late ' : 'Replied ') + mmss(s.response_sec) + '</span>';
    return '<span class="sla g" data-due="' + esc(s.due_at || l.due_at) + '">--:--</span>';
  }
  function tick() {
    S.$$('[data-due]').forEach(function (el) {
      var rem = (Date.parse(el.getAttribute('data-due')) - Date.now()) / 1000, c = 'g', t = mmss(rem);
      if (rem < 0) { c = 'r'; t = 'Breached +' + t; } else if (rem <= 120) { c = 'a'; t = t + ' left'; } else t = t + ' left';
      el.className = 'sla ' + c; if (el.textContent !== t) el.textContent = t;
    });
  }
  setInterval(tick, 1000);

  function qs() {
    var p = new URLSearchParams(); S.$$('input,select', fbar).forEach(function (i) { if (i.type === 'checkbox') { if (i.checked) p.set(i.name, '1'); } else if (i.value) p.set(i.name, i.value); });
    p.set('page', state.page); return p.toString();
  }
  function loadStats() {
    S.api('/api/staff/leads/stats').then(function (s) {
      var k = function (l, v, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '"><small>' + l + '</small><strong>' + esc(v) + '</strong></div>'; };
      var bs = s.by_status || {};
      $('#kpis').innerHTML = k('New (awaiting reply)', bs['new'] || 0, (bs['new'] || 0) > 0) + k('Replied within 5 min', s.pct_within_5min == null ? '-' : s.pct_within_5min + '%') + k('SLA breached', s.breached || 0, s.breached > 0) + k('Avg response (min)', s.avg_response_min == null ? '-' : s.avg_response_min);
    }).catch(function () { $('#kpis').innerHTML = ''; });
  }
  function load(keepScroll) {
    S.api('/api/staff/leads?' + qs()).then(function (r) {
      var items = r.items || [];
      if (!items.length) list.innerHTML = '<p class="empty">No leads match these filters.</p>';
      else list.innerHTML = items.map(function (l) {
        return '<button class="lrow" type="button" data-id="' + esc(l.id) + '">' + chip(l) + '<span class="who"><strong>' + esc(l.name) + '</strong><small>' + esc(l.phone) + '</small></span>' +
          '<span class="meta2"><span>' + esc(l.model_name || l.type || '-') + '</span><span><span class="st st-' + esc(l.status) + '">' + esc(l.status.replace('_', ' ')) + '</span></span><span>' + esc(l.assignee_name || 'Unassigned') + '</span><span title="' + esc(l.source) + '">' + esc(S.ago(l.created_at)) + ' ago</span></span></button>';
      }).join('');
      var pages = Math.ceil((r.total || 0) / (r.pageSize || 25)); pager.innerHTML = '';
      for (var p = 1; pages > 1 && p <= pages; p++) pager.innerHTML += '<button type="button" class="pill' + (p === state.page ? ' on' : '') + '" data-p="' + p + '"' + (p === state.page ? ' aria-current="page"' : '') + '>' + p + '</button>';
      tick();
    }).catch(function (e) { list.innerHTML = '<p class="err" role="alert">' + esc(e.message) + ' <button class="btn btn-sm btn-o" type="button" id="retry">Retry</button></p>'; var b = $('#retry'); if (b) b.onclick = load; });
  }
  fbar.addEventListener('input', function (e) { clearTimeout(fbar._t); fbar._t = setTimeout(function () { state.page = 1; load(); }, e.target.type === 'search' ? 350 : 0); });
  fbar.addEventListener('submit', function (e) { e.preventDefault(); });
  pager.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { state.page = +b.getAttribute('data-p'); load(); scrollTo(0, 0); } });
  list.addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (b) openLead(b.getAttribute('data-id'), b); });
  loadStats(); load();
  setInterval(function () { if (!current) { load(); loadStats(); } }, 30000);

  // ---- drawer ----
  var dr = $('#drawer'), sc = $('#scrim'), body = $('#dr-body');
  S.trap(dr);
  function close() { dr.classList.remove('open'); sc.hidden = true; setTimeout(function () { dr.hidden = true; }, 250); current = null; if (lastFocus) lastFocus.focus(); load(); loadStats(); }
  $('#dr-close').addEventListener('click', close); sc.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) close(); });

  function getConsultants() {
    if (consultants) return Promise.resolve(consultants);
    return S.api('/api/staff/consultants').then(function (r) { consultants = S.items(r); return consultants; }).catch(function () {
      return S.api('/api/admin/users').then(function (r) { consultants = S.items(r).filter(function (u) { return u.active && /consultant|used_manager|admin/.test(u.role); }); return consultants; }).catch(function () { consultants = []; return consultants; });
    });
  }
  function openLead(id, from) {
    lastFocus = from || document.activeElement; current = id; dr.hidden = false; sc.hidden = false; requestAnimationFrame(function () { dr.classList.add('open'); });
    body.innerHTML = '<div class="skel row"></div><div class="skel row"></div>'; $('#dr-title').textContent = 'Lead'; dr.focus();
    Promise.all([S.api('/api/staff/leads/' + id), getConsultants()]).then(function (a) { render(a[0], a[1]); }).catch(function (e) { body.innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  function renderAi(sum) {
    if (!sum) return '<p class="muted">No summary yet.</p>';
    if (typeof sum === 'string') return '<p>' + esc(sum) + '</p>';
    return '<dl class="kv">' + Object.keys(sum).map(function (k) { var v = sum[k]; if (Array.isArray(v)) v = v.join(', '); else if (v && typeof v === 'object') v = JSON.stringify(v); return '<dt>' + esc(S.pretty(k)) + '</dt><dd>' + esc(v) + '</dd>'; }).join('') + '</dl>';
  }
  function render(r, cons) {
    var l = r.lead, ai = r.ai || {}, ti = l.trade_in;
    $('#dr-title').textContent = l.name;
    var tl = (r.events || []).map(function (e) { return { t: e.created_at, k: e.type, d: e.detail, u: e.user_name }; }).concat((r.messages || []).map(function (m) { return { t: m.created_at, k: 'message ' + m.direction + ' (' + m.channel + ', ' + m.status + ')', d: m.body, rep: 1 }; })).sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    body.innerHTML =
      '<section><h3>Customer</h3><p>' + chip(l) + ' <span class="st st-' + esc(l.status) + '">' + esc(l.status.replace('_', ' ')) + '</span>' + (l.opted_out ? ' <span class="st">opted out</span>' : '') + '</p>' +
      '<dl class="kv"><dt>Phone</dt><dd><a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a></dd>' + (l.email ? '<dt>Email</dt><dd>' + esc(l.email) + '</dd>' : '') + '<dt>Interest</dt><dd>' + esc(l.model_name || l.type) + '</dd><dt>Source</dt><dd>' + esc(l.source) + '</dd><dt>Showroom</dt><dd>' + esc(l.showroom_name || '-') + '</dd><dt>Assigned</dt><dd>' + esc(l.assignee_name || 'Unassigned') + '</dd><dt>Created</dt><dd>' + esc(S.fmtDT(l.created_at)) + '</dd>' +
      (l.message ? '<dt>Message</dt><dd>' + esc(l.message) + '</dd>' : '') + (ti ? '<dt>Trade-in</dt><dd>' + esc(Object.keys(ti).map(function (k) { return k + ': ' + ti[k]; }).join(', ')) + '</dd>' : '') + '</dl></section>' +
      '<section class="ai-box"><span class="ai-tag">AI-generated - review before use</span>' + renderAi(ai.summary) + '<button class="btn btn-sm btn-o" type="button" id="ai-regen">Regenerate</button></section>' +
      '<section><h3>Status and notes</h3><div class="rowf"><div class="field"><label for="d-status">Status</label><select id="d-status">' + S.opts(['new', 'contacted', 'test_drive', 'negotiation', 'won', 'lost'], l.status) + '</select></div></div>' +
      '<div class="field"><label for="d-notes">Notes</label><textarea id="d-notes" rows="3">' + esc(l.notes || '') + '</textarea></div><button class="btn btn-sm" type="button" id="d-save">Save status and notes</button></section>' +
      '<section><h3>Reassign</h3><div class="rowf"><div class="field"><label for="d-user">Consultant</label><select id="d-user">' + S.opts(cons.map(function (c) { return [c.id, c.name + (c.showroom_name ? ' (' + c.showroom_name + ')' : '')]; }), l.assigned_to, 'Choose') + '</select></div><div class="field"><label for="d-reason">Reason</label><input id="d-reason" maxlength="200"></div></div><button class="btn btn-sm btn-o" type="button" id="d-re">Reassign</button></section>' +
      '<section><h3>First reply</h3><div class="field"><label for="d-ch">Channel</label><select id="d-ch"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></div>' +
      '<div class="field"><label for="d-text">Message (AI draft - edit before sending)</label><textarea id="d-text" rows="6" maxlength="1000">' + esc(ai.draft || '') + '</textarea><p class="muted small">Do not quote discounts, offers or on-road amounts. The server rejects them.</p><p class="err" id="d-text-e" role="alert" hidden></p></div>' +
      '<label class="chk"><input type="checkbox" id="d-ok"><span>I have reviewed and edited this message</span></label><button class="btn" type="button" id="d-send" disabled>Send reply</button></section>' +
      '<section><h3>Activity</h3><ul class="tl">' + (tl.length ? tl.map(function (x) { return '<li class="' + (x.rep ? 'rep' : '') + '"><small>' + esc(S.fmtDT(x.t)) + (x.u ? ' by ' + esc(x.u) : '') + '</small><strong>' + esc(x.k) + '</strong> ' + esc(x.d || '') + '</li>'; }).join('') : '<li>No activity yet</li>') + '</ul></section>';
    var id = l.id;
    function rerender() { return S.api('/api/staff/leads/' + id).then(function (r2) { render(r2, cons); tick(); }); }
    $('#ai-regen').onclick = function (e) { e.target.disabled = true; e.target.textContent = 'Regenerating...'; S.api('/api/staff/leads/' + id + '/ai', 'POST', {}).then(rerender).catch(function (er) { S.toast(S.errText(er), 1); e.target.disabled = false; }); };
    $('#d-save').onclick = function () { S.api('/api/staff/leads/' + id, 'PATCH', { status: $('#d-status').value, notes: $('#d-notes').value }).then(function () { S.toast('Saved'); return rerender(); }).catch(function (er) { S.toast(S.errText(er), 1); }); };
    $('#d-re').onclick = function () { var u = $('#d-user').value; if (!u) { S.toast('Choose a consultant', 1); $('#d-user').focus(); return; } S.api('/api/staff/leads/' + id + '/reassign', 'POST', { user_id: +u, reason: $('#d-reason').value }).then(function () { S.toast('Reassigned'); return rerender(); }).catch(function (er) { S.toast(S.errText(er), 1); }); };
    var ok = $('#d-ok'), send = $('#d-send'), tx = $('#d-text');
    function gate() { send.disabled = !(ok.checked && tx.value.trim()); }
    ok.onchange = gate; tx.oninput = function () { ok.checked = false; gate(); $('#d-text-e').hidden = true; };
    send.onclick = function () {
      send.disabled = true; send.textContent = 'Sending...';
      S.api('/api/staff/leads/' + id + '/reply', 'POST', { text: tx.value, channel: $('#d-ch').value, confirmed_edit: true }).then(function (r2) {
        S.toast(r2.blocked ? 'Not sent: customer has opted out' : 'Reply sent', r2.blocked); return rerender();
      }).catch(function (er) { var e = $('#d-text-e'); e.textContent = er.message; e.hidden = false; send.textContent = 'Send reply'; gate(); });
    };
    tick();
  }
})();
