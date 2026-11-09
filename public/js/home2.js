/* Home v2: hero carousel + parallax, pinned model rail, EMI-first budget filter with FLIP, 4-question matcher. */
(function () {
  'use strict';
  var A = window.A, d = document, w = window, RM = A.RM, F = w.__F || {};
  var fine = w.matchMedia && w.matchMedia('(pointer:fine)').matches;
  var data = {}; try { data = JSON.parse(A.$('#home-data').textContent); } catch (e) { }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lakh = function (n) { n = Math.round(n); return n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' Lakh' : A.inr(n); };

  /* ---- hero ---- */
  var hero = A.$('.hero3');
  if (hero) {
    var ready = function () { hero.classList.add('ready'); }; if (d.readyState === 'complete') setTimeout(ready, 1200); else w.addEventListener('load', function () { setTimeout(ready, 1200); });
    var slides = A.$$('.h3-slide', hero), caps = A.$$('.h3-cap', hero), dots = A.$$('.dot-b', hero), idx = 0, timer, vis = true;
    var go = function (n) {
      ready(); idx = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('on', k === idx); });
      caps.forEach(function (c, k) { var on = k === idx; c.classList.toggle('on', on); if (on) { c.removeAttribute('aria-hidden'); c.removeAttribute('tabindex'); } else { c.setAttribute('aria-hidden', 'true'); c.setAttribute('tabindex', '-1'); } });
      dots.forEach(function (x, k) { x.classList.toggle('on', k === idx); });
    };
    var auto = function () { clearInterval(timer); if (RM || !vis) return; timer = setInterval(function () { go(idx + 1); }, 7000); };
    A.$('[data-prev]', hero).addEventListener('click', function () { go(idx - 1); auto(); });
    A.$('[data-next]', hero).addEventListener('click', function () { go(idx + 1); auto(); });
    dots.forEach(function (x, k) { x.addEventListener('click', function () { go(k); auto(); }); });
    hero.addEventListener('mouseenter', function () { clearInterval(timer); }); hero.addEventListener('mouseleave', auto);
    hero.addEventListener('focusin', function () { clearInterval(timer); }); hero.addEventListener('focusout', auto);
    if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; auto(); }).observe(hero);
    auto();
    if (fine && !RM) {
      var bg = A.$('.h3-bg', hero), raf = 0;
      hero.addEventListener('pointermove', function (e) {
        if (raf) return; raf = requestAnimationFrame(function () { raf = 0; var r = hero.getBoundingClientRect(); bg.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5) * 2); bg.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5) * 2); });
      });
    }
  }

  /* ---- pinned horizontal model rail ---- */
  var rail = A.$('[data-rail]');
  if (rail) {
    var track = A.$('[data-track]', rail), n = A.$$('.rail-slide', rail).length, prog = A.$('[data-prog]', rail), tabs = A.$$('.rail-bar li', rail), desk = w.matchMedia('(min-width:900px)'), tk = 0, last = -1;
    rail.style.setProperty('--n', n);
    var upd = function () {
      tk = 0; if (!desk.matches) { track.style.removeProperty('--tx'); return; }
      var r = rail.getBoundingClientRect(), total = rail.offsetHeight - w.innerHeight, p = clamp(-r.top / total, 0, 1);
      track.style.setProperty('--tx', (-p * (n - 1) * 100).toFixed(3) + 'vw'); rail.style.setProperty('--p', p.toFixed(4)); if (prog) prog.parentNode.parentNode.style.setProperty('--p', p.toFixed(4));
      var i = Math.round(p * (n - 1)); if (i !== last) { last = i; tabs.forEach(function (t, k) { t.classList.toggle('on', k === i); }); }
    };
    var onScroll = function () { if (!tk) tk = requestAnimationFrame(upd); };
    w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll); upd();
    // keyboard users tabbing into an off-screen slide bring it into view
    A.$$('.rail-slide', rail).forEach(function (s, i) {
      s.addEventListener('focusin', function () {
        if (!desk.matches) { s.scrollIntoView({ inline: 'center', block: 'nearest', behavior: RM ? 'auto' : 'smooth' }); return; }
        var total = rail.offsetHeight - w.innerHeight; w.scrollTo({ top: rail.offsetTop + total * (i / Math.max(1, n - 1)), behavior: 'auto' });
      });
    });
  }

  /* ---- budget: EMI -> max price -> live filter with FLIP reflow ---- */
  var bc = A.$('[data-budget]');
  if (bc) {
    var emi = A.$('#b-emi'), out = A.$('#b-out'), mx = A.$('#b-max'), cnt = A.$('#b-cnt'), grid = A.$('#b-grid'), none = A.$('#b-none'), items = A.$$('.bi', grid);
    var rate = +bc.getAttribute('data-rate') || 9.5, pending = 0;
    var maxPrice = function (e, months, dp, r) { var i = r / 1200, loan = i ? e * (1 - Math.pow(1 + i, -months)) / i : e * months; return loan / (1 - dp / 100); };
    var val = function (name) { var c = A.$('input[name=' + name + ']:checked', bc); return c ? +c.value : 0; };
    function flip(apply) {
      var before = new Map(); items.forEach(function (el) { if (!el.hidden) before.set(el, el.getBoundingClientRect()); });
      apply();
      if (RM || !el0().animate) return;
      items.forEach(function (el) {
        if (el.hidden) return; var b = before.get(el), r = el.getBoundingClientRect();
        if (!b) { el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }); return; }
        var dx = b.left - r.left, dy = b.top - r.top; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
    }
    var el0 = function () { return items[0] || d.body; };
    function update() {
      pending = 0;
      var e = +emi.value, m = val('b-ten') || 60, dp = val('b-dp') || 20, max = maxPrice(e, m, dp, rate);
      out.textContent = A.inr(e); emi.setAttribute('aria-valuetext', A.inr(e) + ' ' + (F.bud_month || '')); emi.style.setProperty('--fill', ((e - emi.min) / (emi.max - emi.min) * 100) + '%');
      A.tween(mx, max, lakh);
      var k = 0; flip(function () { items.forEach(function (el) { var ok = +el.getAttribute('data-p') <= max; el.hidden = !ok; if (ok) k++; }); });
      cnt.textContent = k + ' ' + (F.bud_match || ''); none.hidden = k > 0;
      A.$('#b-new').href = '/new-cars?maxPrice=' + Math.round(max); A.$('#b-used').href = '/used-cars?maxPrice=' + Math.round(max);
    }
    var sched = function () { if (!pending) pending = requestAnimationFrame(update); };
    bc.addEventListener('input', sched); bc.addEventListener('change', sched); update();
  }

  /* ---- "Find my car" matcher ---- */
  var dlg = A.$('#finder');
  if (dlg && dlg.showModal) {
    var f = A.$('form', dlg), steps = A.$$('.fd-step', dlg), cur = 1, opener = null, err = A.$('.fd-err', dlg), nx = A.$('[data-next]', dlg), bk = A.$('[data-back]', dlg), ag = A.$('[data-again]', dlg), pr = A.$('.fd-prog', dlg), ttl = A.$('#fd-title', dlg);
    var femi = A.$('#fd-emi', dlg), fo = A.$('#fd-emi-o', dlg);
    var BODY = { solo: { hatchback: 3, sedan: 2, suv: 1, mpv: 0 }, two: { hatchback: 2, sedan: 3, suv: 2, mpv: 0 }, fam: { hatchback: 1, sedan: 2, suv: 3, mpv: 2 }, big: { hatchback: 0, sedan: 0, suv: 2, mpv: 4 } };
    var WHERE = { city: { hatchback: 3, sedan: 1, suv: 1, mpv: 0 }, hwy: { hatchback: 0, sedan: 3, suv: 3, mpv: 1 }, mix: { hatchback: 1, sedan: 2, suv: 3, mpv: 2 } };
    var PRIO = { eff: { hatchback: 3, sedan: 2, suv: 1, mpv: 1 }, space: { hatchback: 0, sedan: 1, suv: 3, mpv: 4 }, comfort: { hatchback: 1, sedan: 3, suv: 3, mpv: 3 }, feat: { hatchback: 1, sedan: 2, suv: 3, mpv: 2 } };
    var pick = function (name) { var c = A.$('input[name=' + name + ']:checked', dlg); return c ? c.value : ''; };
    var show = function (n) {
      cur = n; steps.forEach(function (s) { s.hidden = +s.getAttribute('data-s') !== n; }); err.hidden = true;
      ttl.textContent = n <= 4 ? (F.fd_step + ' ' + n + ' ' + F.fd_of + ' 4') : F.fd_res;
      pr.style.setProperty('--w', Math.min(100, (n - 1) / 4 * 100 + (n === 5 ? 0 : 0)) + '%');
      bk.hidden = n === 1; nx.hidden = n === 5; ag.hidden = n !== 5; nx.firstChild.nodeValue = (n === 4 ? F.fd_see : F.fd_next) + ' ';
      var h = A.$('.fd-step:not([hidden]) .fd-q', dlg); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    };
    var rank = function () {
      var e = +femi.value, a = { who: pick('who'), where: pick('where'), prio: pick('prio') }, rate = (data.emi && data.emi.rate) || 9.5, maxp = (function () { var i = rate / 1200; return e * (1 - Math.pow(1 + i, -60)) / i / 0.8; })();
      var prices = data.cars.map(function (c) { return c.price; }).sort(function (x, y) { return x - y; });
      return data.cars.map(function (c) {
        var s = 0, why = [], b = c.body, wv = (BODY[a.who] || {})[b] || 0, wh = (WHERE[a.where] || {})[b] || 0, pv = (PRIO[a.prio] || {})[b] || 0;
        s += wv * 3; if (wv >= 3) why.push(F.fr_who);
        s += wh * 2; if (wh >= 3) why.push(a.where === 'city' ? F.fr_city : a.where === 'hwy' ? F.fr_hwy : F.fr_mix);
        if (c.price <= maxp) { s += 7; why.push(F.fr_budget); } else if (c.price <= maxp * 1.12) s += 2; else s -= 10;
        s += pv * 2; if (pv >= 3) why.push({ eff: F.fr_eff, space: F.fr_space, comfort: F.fr_comfort, feat: F.fr_feat }[a.prio]);
        if (a.prio === 'eff' && (c.fuels || []).some(function (x) { return /cng|electric|hybrid/i.test(x); })) s += 2;
        if (a.prio === 'feat') s += (prices.indexOf(c.price) / Math.max(1, prices.length - 1)) * 3;
        return { c: c, s: s, why: why };
      }).sort(function (x, y) { return y.s - x.s || x.c.price - y.c.price; });
    };
    var results = function () {
      var r = rank(), top = [], kinds = {};
      r.forEach(function (x) { if (top.length < 3 && (kinds[x.c.k] || 0) < 2) { top.push(x); kinds[x.c.k] = (kinds[x.c.k] || 0) + 1; } });
      var ol = A.$('#fd-res', dlg);
      ol.innerHTML = top.map(function (x, i) {
        var why = x.why.slice(0, 2).join(', ');
        return '<li><img src="' + A.esc(x.c.img) + '" alt="" width="120" height="80"><div><b>#' + (i + 1) + ' ' + A.esc(x.c.name) + '</b> <span class="chip">' + A.esc(x.c.k === 'new' ? F.kind_new : F.kind_used) + '</span><p>' + A.esc(why ? x.c.name + ' ' + why + '.' : x.c.name) + '</p></div><span class="pc">' + A.esc(lakh(x.c.price)) + '</span><a class="btn btn-red btn-sm" href="' + A.esc(x.c.url) + '">' + A.esc(F.fd_view) + '</a></li>';
      }).join('');
      if (!RM) { var load = function (cb) { if (w.Motion) return cb(w.Motion); var s = d.createElement('script'); s.src = '/js/vendor/motion-mini.js'; s.onload = function () { cb(w.Motion); }; s.onerror = function () { cb(null); }; d.head.appendChild(s); };
        load(function (M) { A.$$('li', ol).forEach(function (li, i) { if (M && M.animate) M.animate(li, { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0px)'] }, { duration: .6, delay: i * .1, ease: [.16, 1, .3, 1] }); }); }); }
    };
    nx.addEventListener('click', function () {
      var need = { 1: 'who', 2: 'where', 4: 'prio' }[cur];
      if (need && !pick(need)) { err.hidden = false; return; }
      if (cur === 4) { results(); show(5); } else show(cur + 1);
    });
    bk.addEventListener('click', function () { show(Math.max(1, cur - 1)); });
    ag.addEventListener('click', function () { f.reset(); fo.textContent = A.inr(+femi.value); show(1); });
    femi.addEventListener('input', function () { fo.textContent = A.inr(+femi.value); femi.style.setProperty('--fill', ((femi.value - femi.min) / (femi.max - femi.min) * 100) + '%'); });
    femi.style.setProperty('--fill', ((femi.value - femi.min) / (femi.max - femi.min) * 100) + '%');
    f.addEventListener('change', function (e) { if (e.target.type === 'radio') err.hidden = true; });
    A.$$('[data-close]', dlg).forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (opener) opener.focus(); });
    A.$$('[data-finder-open]').forEach(function (b) { b.addEventListener('click', function () { opener = b; f.reset(); fo.textContent = A.inr(+femi.value); show(1); dlg.showModal(); }); });
  }
})();
