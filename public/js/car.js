(function () {
  'use strict';
  var A = window.A;
  var img = A.$('.stage-img'), xf = A.$('.stage .xf');
  // colour bloom: the new render spreads out of the swatch that was tapped (clip-path circle)
  function swap(url, from) {
    if (!img) return; var n = new Image();
    n.onload = function () {
      if (!xf) { img.src = url; return; }
      var st = xf.parentNode.getBoundingClientRect(), b = from && from.getBoundingClientRect(), x = b ? ((b.left + b.width / 2 - st.left) / st.width * 100) : 50, y = b ? ((b.top + b.height / 2 - st.top) / st.height * 100) : 50;
      xf.style.transition = 'none'; xf.src = url; xf.style.opacity = 1;
      if (A.RM || !xf.animate) { img.src = url; xf.style.opacity = 0; return; }
      var a = xf.animate([{ clipPath: 'circle(0% at ' + x + '% ' + y + '%)' }, { clipPath: 'circle(150% at ' + x + '% ' + y + '%)' }], { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)' });
      a.onfinish = function () { img.src = url; xf.style.opacity = 0; };
    };
    n.src = url;
  }
  A.$$('.sw').forEach(function (b) {
    b.addEventListener('click', function () {
      A.$$('.sw').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      var ds = b.getAttribute('data-src');
      if (ds) swap(ds, b);
      else if (img && img.getAttribute('src').indexOf('/img/car/') === 0) { var u = new URL(img.src, location.href); u.searchParams.set('c', b.getAttribute('data-color')); swap(u.pathname + u.search, b); }
    });
  });
  var box = A.$('[data-onroad]'); if (!box) return;
  function wfIn() { var wf = A.$('.wf', box); if (wf) requestAnimationFrame(function () { requestAnimationFrame(function () { wf.classList.add('in'); }); }); }
  var city = A.$('#pb-city'), v = A.$('#pb-var'), acc = A.$('#pb-acc'), bk = A.$('[data-bk]', box), seq = 0;
  function totals(txt, raw) { A.$$('[data-total]').forEach(function (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); if (raw != null) A.tween(el, raw); else el.textContent = txt; }); }
  function load() {
    var n = ++seq; bk.classList.add('busy');
    A.json('/ui/onroad?variant=' + encodeURIComponent(v.value) + '&city=' + encodeURIComponent(city.value) + '&accessories=' + (acc.checked ? 1 : 0)).then(function (r) {
      if (n !== seq) return; bk.innerHTML = r.html; bk.classList.remove('busy'); totals(r.total, r.raw); wfIn();
      if (r.raw) { var e = A.$('[data-emi]'); if (e) e.dispatchEvent(new CustomEvent('emi:price', { detail: r.raw })); }
    }).catch(function () {
      if (n !== seq) return; bk.classList.remove('busy');
      bk.innerHTML = '<p class="err" role="alert">' + A.esc(A.I.error_generic) + ' <button class="btn btn-sm btn-o" type="button" data-retry>' + A.esc(A.I.retry) + '</button></p>';
      var rb = A.$('[data-retry]', bk); if (rb) rb.onclick = load;
    });
  }
  [city, v, acc].forEach(function (el) { el.addEventListener('change', load); });
  (function () { var wf = A.$('.wf', box); if (!wf) return; if (A.RM || !('IntersectionObserver' in window)) { wf.classList.add('in'); return; } var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); wf.classList.add('in'); } }, { threshold: .3 }); io.observe(wf); })();
  try {
    var sc = localStorage.getItem('city');
    if (sc && A.$('option[value="' + sc + '"]', city) && sc !== city.value) { city.value = sc; load(); }
    city.addEventListener('change', function () { localStorage.setItem('city', city.value); });
  } catch (e) { }
  (function () {
    var pb = A.$('[data-pricebar]'), box2 = A.$('.pricebox'); if (!pb || !box2 || !('IntersectionObserver' in window)) return;
    var vr = A.$('[data-vr]', pb), sync = function () { vr.textContent = v.options[v.selectedIndex] ? v.options[v.selectedIndex].text : ''; }; sync(); v.addEventListener('change', sync);
    new IntersectionObserver(function (es) { var gone = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; pb.classList.toggle('on', gone); if (gone) pb.removeAttribute('inert'); else pb.setAttribute('inert', ''); }).observe(box2);
  })();
  var lv = A.$('[data-lead] [name=variantId]');
  v.addEventListener('change', function () { if (lv) lv.value = v.value; }); if (lv) lv.value = v.value;
})();
