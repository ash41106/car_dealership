(function () {
  'use strict';
  var S = window.S, $ = S.$, esc = S.esc, cons = [], busy = false;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(s) { s = Math.abs(Math.round(s)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function tick() {
    S.$$('[data-due]').forEach(function (el) {
      var rem = (Date.parse(el.getAttribute('data-due')) - Date.now()) / 1000, c = 'g', t = mmss(rem) + ' left';
      if (rem < 0) { c = 'r'; t = 'Breached +' + mmss(rem); } else if (rem <= 120) c = 'a';
      el.className = 'sla ' + c; if (el.textContent !== t) el.textContent = t;
    });
  }
  setInterval(tick, 1000);
  function card(l) {
    var canAssign = S.can('lead.reassign');
    return '<div class="mini"><div class="row1"><strong>' + esc(l.name) + '</strong><span class="sla g" data-due="' + esc(l.due_at) + '">--:--</span></div><small class="muted">' + esc(l.phone) + ' &middot; ' + esc(l.model_name || l.type) + ' &middot; ' + esc(l.showroom_name || '') + '</small><small>' + esc(l.assignee_name || 'Unassigned') + '</small>' +
      (canAssign ? '<div class="rowf"><label class="sr" for="a' + l.id + '">Assign to</label><select id="a' + l.id + '" data-lead="' + esc(l.id) + '">' + S.opts(cons.map(function (c) { return [c.id, c.name + ' (' + (c.open_leads == null ? '' : c.open_leads + ' open') + ')']; }), l.assigned_to, 'Assign to...') + '</select><button class="btn btn-sm" type="button" data-assign="' + esc(l.id) + '">Assign</button></div>' : '') + '</div>';
  }
  function load() {
    if (busy) return; busy = true;
    Promise.all([S.api('/api/staff/sla'), S.api('/api/staff/leads/stats').catch(function () { return {}; }), S.api('/api/staff/consultants').catch(function () { return []; })]).then(function (r) {
      busy = false; var m = r[0], st = r[1]; cons = S.items(r[2]);
      var fill = function (id, n, arr) { $(id).innerHTML = arr.length ? arr.map(function (l) { return card({ id: l.id, name: l.name, phone: l.phone, type: l.source, model_name: l.model_name, showroom_name: l.showroom_name, assignee_name: l.assignee_name, assigned_to: l.assignee_id, due_at: l.due_at }); }).join('') : '<p class="muted">Nothing here.</p>'; $(n).textContent = arr.length; };
      if (!document.activeElement || document.activeElement.tagName !== 'SELECT') { fill('#c-un', '#n-un', m.unassigned || []); fill('#c-br', '#n-br', m.near_breach || []); fill('#c-bd', '#n-bd', m.breached || []); }
      var c = m.counts || {}, k = function (l, v, bad) { return '<div class="kpi' + (bad ? ' bad' : '') + '"><small>' + l + '</small><strong>' + esc(v) + '</strong></div>'; };
      $('#kpis').innerHTML = k('Open leads', c.open || 0) + k('Unassigned', c.unassigned || 0, c.unassigned > 0) + k('About to breach', c.near_breach || 0, c.near_breach > 0) + k('Breached', c.breached || 0, c.breached > 0) + k('Replied within 5 min', st.pct_within_5min == null ? '-' : st.pct_within_5min + '%');
      var pc = m.per_consultant || [], mx = Math.max.apply(null, pc.map(function (x) { return x.open; }).concat([1]));
      $('#load').innerHTML = pc.map(function (x) { return '<div class="bar-l"><span>' + esc(x.name) + '</span><div><i class="' + (x.breached > 0 ? 'r' : '') + '" style="width:' + (x.open / mx * 100) + '%"></i></div><strong>' + x.open + ' open' + (x.breached ? ', ' + x.breached + ' late' : '') + '</strong></div>'; }).join('') || '<p class="muted">No assigned leads</p>';
      tick();
    }).catch(function (e) { busy = false; $('#c-un').innerHTML = '<p class="err" role="alert">' + esc(e.message) + '</p>'; });
  }
  $('#cols').addEventListener('click', function (e) {
    var b = e.target.closest('[data-assign]'); if (!b) return; var id = b.getAttribute('data-assign'), sel = $('#a' + id);
    if (!sel.value) { S.toast('Choose a consultant', 1); sel.focus(); return; }
    b.disabled = true; S.api('/api/staff/leads/' + id + '/reassign', 'POST', { user_id: +sel.value, reason: 'Assigned from SLA desk' }).then(function () { S.toast('Assigned'); load(); }).catch(function (er) { b.disabled = false; S.toast(S.errText(er), 1); });
  });
  load(); setInterval(load, 10000);
})();
