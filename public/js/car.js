(function () {
  'use strict';
  var A = window.A;
  var img = A.$('.stage-img'), xf = A.$('.stage .xf');
  function swap(url) {
    if (!img) return; var n = new Image();
    n.onload = function () { if (!xf) { img.src = url; return; } xf.src = url; xf.style.opacity = 1; setTimeout(function () { img.src = url; xf.style.opacity = 0; }, 520); };
    n.src = url;
  }
  A.$$('.sw').forEach(function (b) {
    b.addEventListener('click', function () {
      A.$$('.sw').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      var ds = b.getAttribute('data-src');
      if (ds) swap(ds);
      else if (img && img.getAttribute('src').indexOf('/img/car/') === 0) { var u = new URL(img.src, location.href); u.searchParams.set('c', b.getAttribute('data-color')); swap(u.pathname + u.search); }
    });
  });
  var box = A.$('[data-onroad]'); if (!box) return;
  var city = A.$('#pb-city'), v = A.$('#pb-var'), acc = A.$('#pb-acc'), bk = A.$('[data-bk]', box), seq = 0;
  function totals(txt, raw) { A.$$('[data-total]').forEach(function (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); if (raw != null) A.tween(el, raw); else el.textContent = txt; }); }
  function load() {
    var n = ++seq; bk.classList.add('busy');
    A.json('/ui/onroad?variant=' + encodeURIComponent(v.value) + '&city=' + encodeURIComponent(city.value) + '&accessories=' + (acc.checked ? 1 : 0)).then(function (r) {
      if (n !== seq) return; bk.innerHTML = r.html; bk.classList.remove('busy'); totals(r.total, r.raw);
      if (r.raw) { var e = A.$('[data-emi]'); if (e) e.dispatchEvent(new CustomEvent('emi:price', { detail: r.raw })); }
    }).catch(function () {
      if (n !== seq) return; bk.classList.remove('busy');
      bk.innerHTML = '<p class="err" role="alert">' + A.esc(A.I.error_generic) + ' <button class="btn btn-sm btn-o" type="button" data-retry>' + A.esc(A.I.retry) + '</button></p>';
      var rb = A.$('[data-retry]', bk); if (rb) rb.onclick = load;
    });
  }
  [city, v, acc].forEach(function (el) { el.addEventListener('change', load); });
  try {
    var sc = localStorage.getItem('city');
    if (sc && A.$('option[value="' + sc + '"]', city) && sc !== city.value) { city.value = sc; load(); }
    city.addEventListener('change', function () { localStorage.setItem('city', city.value); });
  } catch (e) { }
  var lv = A.$('[data-lead] [name=variantId]');
  v.addEventListener('change', function () { if (lv) lv.value = v.value; }); if (lv) lv.value = v.value;
})();
