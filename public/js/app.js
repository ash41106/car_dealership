(function () {
  'use strict';
  var d = document, w = window, I = w.__I || {}, LANG = w.__LANG || 'en';
  d.documentElement.classList.add('js');
  var RM = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var A = w.A = { I: I, lang: LANG, RM: RM };
  A.$ = function (s, r) { return (r || d).querySelector(s); };
  A.$$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  A.esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]; }); };
  A.inr = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); };
  // shared pure EMI formula (reducing balance). Mirrors services/catalog.emi
  A.emi = function (P, rate, n) { var r = rate / 1200; if (P <= 0) return 0; if (!r) return P / n; var f = Math.pow(1 + r, n); return P * r * f / (f - 1); };
  A.json = function (url, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ 'Accept': 'application/json' }, opt.headers || {});
    opt.credentials = 'same-origin';
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || j.message || I.error_generic); e.status = r.status; e.errors = j.errors; throw e; }
        return j;
      });
    });
  };
  A.post = function (url, body, method) { return A.json(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(body) }); };
  A.tween = function (el, to, fmt) {
    fmt = fmt || A.inr; if (!el) return;
    var from = parseFloat(el.getAttribute('data-v')) || 0; el.setAttribute('data-v', to);
    if (RM || from === to) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 450;
    (function f(t) { var p = Math.min(1, (t - t0) / dur); p = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * p); if (p < 1) requestAnimationFrame(f); })(t0);
  };
  var pg = A.$('#progress');
  if (pg) { pg.style.width = '70%'; w.addEventListener('load', function () { pg.style.width = '100%'; setTimeout(function () { pg.style.opacity = 0; }, 350); }); }
  var hdr = A.$('#hdr');
  function onS() { if (hdr) hdr.classList.toggle('small', w.scrollY > 24); }
  onS(); w.addEventListener('scroll', onS, { passive: true });
  var bg = A.$('#burger'), nav = A.$('#nav');
  if (bg) bg.addEventListener('click', function () { var o = nav.classList.toggle('open'); bg.setAttribute('aria-expanded', o); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav && nav.classList.contains('open')) { nav.classList.remove('open'); bg.setAttribute('aria-expanded', 'false'); bg.focus(); } });
  var rv = A.$$('.reveal');
  if ('IntersectionObserver' in w && !RM) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (el, i) { el.style.setProperty('--d', (i % 4) * 0.08 + 's'); io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });
  var gh = A.$('[data-par]');
  if (gh && !RM) { var tk = false; w.addEventListener('scroll', function () { if (tk) return; tk = true; requestAnimationFrame(function () { gh.style.transform = 'translate(-50%,' + (w.scrollY * 0.25) + 'px)'; tk = false; }); }, { passive: true }); }
  A.$$('[data-count]').forEach(function (el) {
    var to = +el.getAttribute('data-count'), suf = el.getAttribute('data-suffix') || '';
    if (RM || !('IntersectionObserver' in w)) return;
    el.textContent = '0' + suf;
    var o = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { o.disconnect(); var t0 = performance.now(); (function f(t) { var p = Math.min(1, (t - t0) / 1200); p = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * p).toLocaleString('en-IN') + suf; if (p < 1) requestAnimationFrame(f); })(t0); }
    });
    o.observe(el);
  });
  var saved = {}; try { saved = JSON.parse(localStorage.getItem('saved') || '{}'); } catch (e) { }
  A.$$('[data-save]').forEach(function (b) {
    var k = b.getAttribute('data-save'); if (saved[k]) b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); if (on) saved[k] = 1; else delete saved[k]; try { localStorage.setItem('saved', JSON.stringify(saved)); } catch (e) { }
      var kind = /^uc-/.test(k) ? 'used' : 'new', signed = false; try { signed = !!localStorage.getItem('cust'); } catch (e) { }
      if (signed) { (on ? A.post('/api/customer/saved', { kind: kind, ref: k }) : A.json('/api/customer/saved?kind=' + kind + '&ref=' + encodeURIComponent(k), { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } })).catch(function () { }); }
      else if (on) { var n = d.getElementById('save-note'); if (!n) { n = d.createElement('div'); n.id = 'save-note'; n.className = 'tray on'; n.style.bottom = '84px'; n.setAttribute('role', 'status'); n.innerHTML = '<span>' + (LANG === 'hi' ? 'सभी डिवाइस पर सेव रखने के लिए साइन इन करें' : 'Sign in to keep saved cars on all devices') + '</span><a class="btn btn-sm" href="/account">' + (LANG === 'hi' ? 'साइन इन' : 'Sign in') + '</a>'; d.body.appendChild(n); setTimeout(function () { n.remove(); }, 5000); } }
    });
  });
  A.$$('[data-toggle]').forEach(function (b) { b.addEventListener('click', function () { var t = A.$(b.getAttribute('data-toggle')), o = t.classList.toggle('open'); b.setAttribute('aria-expanded', o); }); });
  A.$$('[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
  A.$$('[data-emi]').forEach(function (box) {
    var g = function (n) { return A.$('[name=' + n + ']', box); }, out = function (n) { return A.$('[data-out=' + n + ']', box); };
    var fmt = { price: A.inr, dp: A.inr, rate: function (v) { return (+v).toFixed(1) + '%'; }, months: function (v) { return v + ' mo'; } };
    function calc() {
      var pr = g('price') ? +g('price').value : +box.getAttribute('data-price'); var dpI = g('dp');
      dpI.max = Math.max(pr * 0.9, 1000); if (+dpI.value > +dpI.max) dpI.value = dpI.max;
      ['price', 'dp', 'rate', 'months'].forEach(function (n) { var el = g(n), o = A.$('#o-' + n, box); if (el && o) o.textContent = fmt[n](el.value); });
      var loan = Math.max(0, pr - (+dpI.value)), m = +g('months').value, e = A.emi(loan, +g('rate').value, m);
      A.tween(out('emi'), e); out('loan').textContent = A.inr(loan); out('interest').textContent = A.inr(e * m - loan); out('total').textContent = A.inr(e * m + (+dpI.value));
    }
    box.addEventListener('input', calc);
    box.addEventListener('emi:price', function (ev) { box.setAttribute('data-price', ev.detail); var dp = g('dp'); dp.value = Math.round(ev.detail * 0.2 / 5000) * 5000; calc(); });
    calc();
  });
})();

(function () {
  try {
    var nm = localStorage.getItem('custName'), si = document.querySelector('.hdr .signin');
    if (nm && si) si.textContent = nm.split(' ')[0];
  } catch (e) { }
})();
