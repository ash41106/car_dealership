(function () {
  'use strict';
  var A = window.A, d = document, w = window, RM = A.RM, fine = w.matchMedia && w.matchMedia('(pointer:fine)').matches;
  // scroll progress line
  var sb = d.createElement('div'); sb.className = 'scrollbar'; d.body.appendChild(sb);
  var tk = 0;
  w.addEventListener('scroll', function () { if (tk) return; tk = requestAnimationFrame(function () { var h = d.documentElement.scrollHeight - w.innerHeight; sb.style.transform = 'scaleX(' + (h > 0 ? w.scrollY / h : 0) + ')'; tk = 0; }); }, { passive: true });
  // page transition
  if (!RM) d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute('download')) return;
    var u = new URL(a.href, location.href); if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search) || /^\/(api|uploads)/.test(u.pathname)) return;
    e.preventDefault(); d.body.classList.add('leaving'); setTimeout(function () { location.href = a.href; }, 160);
  });
  w.addEventListener('pageshow', function (e) { if (e.persisted) d.body.classList.remove('leaving'); });
  // custom cursor + magnetic + tilt (fine pointer only)
  if (fine && !RM) {
    var c = d.createElement('div'), r = d.createElement('div'); c.className = 'cur'; r.className = 'cur-r'; d.body.append(c, r);
    var x = 0, y = 0, rx = 0, ry = 0, on = false;
    d.addEventListener('pointermove', function (e) { x = e.clientX; y = e.clientY; if (!on) { on = true; d.documentElement.classList.add('cur-on'); rx = x; ry = y; } c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; var h = e.target.closest && e.target.closest('a,button,label,input,select,textarea,[data-tilt]'); d.documentElement.classList.toggle('cur-h', !!h); });
    d.addEventListener('pointerleave', function () { on = false; d.documentElement.classList.remove('cur-on'); });
    (function loop() { rx += (x - rx) * .18; ry += (y - ry) * .18; r.style.transform = 'translate(' + rx + 'px,' + ry + 'px)'; requestAnimationFrame(loop); })();
    A.$$('.hero2 .btn,.band .btn,.scene-band .btn,.story-steps .btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) { var k = b.getBoundingClientRect(); b.style.transform = 'translate(' + (e.clientX - k.left - k.width / 2) * .18 + 'px,' + (e.clientY - k.top - k.height / 2) * .25 + 'px)'; });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
    A.$$('[data-tilt]').forEach(function (t) {
      t.addEventListener('pointermove', function (e) { var k = t.getBoundingClientRect(), px = (e.clientX - k.left) / k.width, py = (e.clientY - k.top) / k.height; t.classList.add('tilting'); t.style.setProperty('--ry', ((px - .5) * 9).toFixed(2) + 'deg'); t.style.setProperty('--rx', ((.5 - py) * 7).toFixed(2) + 'deg'); t.style.setProperty('--mx', px * 100 + '%'); t.style.setProperty('--my', py * 100 + '%'); });
      t.addEventListener('pointerleave', function () { t.classList.remove('tilting'); t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); });
    });
  }
  // drag strips with momentum
  A.$$('[data-strip]').forEach(function (s) {
    if (!fine || RM) return; var down = false, sx = 0, sl = 0, v = 0, lx = 0, moved = false, raf;
    s.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = lx = e.clientX; sl = s.scrollLeft; v = 0; cancelAnimationFrame(raf); s.style.scrollSnapType = 'none'; });
    w.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; s.scrollLeft = sl - dx; v = lx - e.clientX; lx = e.clientX; });
    w.addEventListener('pointerup', function () { if (!down) return; down = false; (function step() { if (Math.abs(v) < .5) { s.style.scrollSnapType = ''; return; } s.scrollLeft += v; v *= .93; raf = requestAnimationFrame(step); })(); });
    s.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  });
  // story
  var st = A.$('[data-story]');
  if (st) {
    var steps = A.$$('.story-steps li', st), vis = A.$$('.sv', st), rail = A.$('.rail i', st);
    var set = function (i) { steps.forEach(function (s, k) { s.classList.toggle('on', k === i); }); vis.forEach(function (s, k) { s.classList.toggle('on', k === i); }); if (rail) rail.style.transform = 'translateY(' + i * 100 + '%)'; };
    set(0);
    if ('IntersectionObserver' in w) { var so = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) set(steps.indexOf(e.target)); }); }, { rootMargin: '-45% 0px -45% 0px' }); steps.forEach(function (s) { so.observe(s); }); }
  }
  // compare tray
  var cmp = []; try { cmp = JSON.parse(localStorage.getItem('cmp') || '[]'); } catch (e) { }
  var boxes = A.$$('[data-cmp]');
  if (boxes.length) {
    var tray = d.createElement('div'); tray.className = 'tray'; tray.setAttribute('role', 'region'); tray.setAttribute('aria-label', 'Compare'); d.body.appendChild(tray);
    var names = {}; boxes.forEach(function (b) { names[b.getAttribute('data-cmp')] = b.getAttribute('data-name'); });
    var draw = function () {
      try { localStorage.setItem('cmp', JSON.stringify(cmp)); } catch (e) { }
      boxes.forEach(function (b) { b.checked = cmp.indexOf(b.getAttribute('data-cmp')) >= 0; });
      tray.classList.toggle('on', cmp.length > 0);
      tray.innerHTML = '<span><b>' + cmp.length + '</b>/3 ' + A.esc(cmp.map(function (s) { return names[s] || s; }).join(' vs ')) + '</span><a class="btn btn-sm" href="/compare?m=' + cmp.join(',') + '">' + A.esc(A.I.compare || 'Compare') + '</a><button class="x" type="button" aria-label="Clear">&times;</button>';
      A.$('.x', tray).onclick = function () { cmp = []; draw(); };
    };
    boxes.forEach(function (b) { b.addEventListener('change', function () { var s = b.getAttribute('data-cmp'); cmp = cmp.filter(function (x) { return x !== s; }); if (b.checked) { if (cmp.length >= 3) { b.checked = false; return; } cmp.push(s); } draw(); }); });
    draw();
  }
  // lightbox
  var PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  var gal = A.$$('.stage img.stage-img, .gal img').filter(function (i) { return !i.closest('[data-nolb]'); });
  if (gal.length && d.createElement('dialog').showModal) {
    var dl = d.createElement('dialog'); dl.className = 'lb'; dl.setAttribute('aria-label', 'Gallery'); dl.innerHTML = '<img alt="" src="' + PX + '"><div class="lb-c"><button class="btn btn-sm btn-w" type="button" data-p>&larr;</button><button class="btn btn-sm btn-w" type="button" data-x>' + A.esc(A.I.close || 'Close') + '</button><button class="btn btn-sm btn-w" type="button" data-n>&rarr;</button></div>'; d.body.appendChild(dl);
    var idx = 0, li = A.$('img', dl);
    var show = function (i) { idx = (i + gal.length) % gal.length; li.src = gal[idx].currentSrc || gal[idx].src; li.alt = gal[idx].alt; };
    gal.forEach(function (g, i) { var t = g.closest('.stage,li'); t.addEventListener('click', function () { show(i); dl.showModal(); }); });
    A.$('[data-p]', dl).onclick = function () { show(idx - 1); }; A.$('[data-n]', dl).onclick = function () { show(idx + 1); }; A.$('[data-x]', dl).onclick = function () { dl.close(); };
    dl.addEventListener('click', function (e) { if (e.target === dl) dl.close(); });
    dl.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') show(idx + 1); if (e.key === 'ArrowLeft') show(idx - 1); });
  }
  // inspection ring
  A.$$('.ring').forEach(function (r) { var p = +r.getAttribute('data-score') / 100; if ('IntersectionObserver' in w && !RM) { var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { r.style.setProperty('--p', p); o.disconnect(); } }); o.observe(r); } else r.style.setProperty('--p', p); });
  // filters drawer
  var ft = A.$('.fl-t'), fl = A.$('#ufilters');
  if (ft && fl) {
    var sc = d.createElement('div'); sc.className = 'fscrim'; sc.hidden = true; d.body.appendChild(sc);
    var x = d.createElement('button'); x.type = 'button'; x.className = 'circ fl-x'; x.setAttribute('aria-label', A.I.close || 'Close'); x.innerHTML = '&times;'; fl.appendChild(x);
    var cl = function () { fl.classList.remove('open'); sc.hidden = true; ft.setAttribute('aria-expanded', 'false'); ft.focus(); };
    ft.addEventListener('click', function () { sc.hidden = !fl.classList.contains('open'); });
    sc.addEventListener('click', cl); x.addEventListener('click', cl); d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fl.classList.contains('open')) cl(); });
  }
})();

(function () {
  var A = window.A, w = window, els = A.$$('[data-bg]'); if (!els.length) return;
  var big = w.innerWidth > 800 || w.devicePixelRatio > 1.5;
  var load = function (el) { var u = (big && el.getAttribute('data-bg-l')) || el.getAttribute('data-bg'); el.style.backgroundImage = 'url(' + u + ')'; el.removeAttribute('data-bg'); el.classList.add('bg-in'); };
  if (!('IntersectionObserver' in w)) { w.addEventListener('load', function () { els.forEach(load); }); return; }
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }); }, { rootMargin: '300px 0px' });
  els.forEach(function (el) { if (el.classList.contains('hero2-bg')) { w.addEventListener('load', function () { setTimeout(function () { if (el.hasAttribute('data-bg')) load(el); }, 600); }); } else io.observe(el); });
})();
(function () {
  var g = document.querySelector('.hero2 .ghost'); if (!g) return;
  var on = function () { setTimeout(function () { g.classList.add('on'); }, 300); };
  if (document.readyState === 'complete') on(); else window.addEventListener('load', on);
})();
