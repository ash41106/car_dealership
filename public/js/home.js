(function () {
  'use strict';
  var A = window.A, c = A.$('[data-carousel]');
  if (c) {
    var sl = A.$$('.slide', c), ds = A.$$('.dot-b', c), i = 0, tm;
    var go = function (n) { i = (n + sl.length) % sl.length; sl.forEach(function (s, k) { s.hidden = k !== i; s.classList.toggle('on', k === i); }); ds.forEach(function (x, k) { x.classList.toggle('on', k === i); }); };
    var auto = function () { if (A.RM) return; clearInterval(tm); tm = setInterval(function () { go(i + 1); }, 6000); };
    A.$('[data-prev]', c).addEventListener('click', function () { go(i - 1); auto(); });
    A.$('[data-next]', c).addEventListener('click', function () { go(i + 1); auto(); });
    ds.forEach(function (x, k) { x.addEventListener('click', function () { go(k); auto(); }); });
    c.addEventListener('mouseenter', function () { clearInterval(tm); }); c.addEventListener('mouseleave', auto); auto();
  }
  var st = A.$('[data-strip]');
  if (st) {
    var step = function () { return Math.min(320, st.clientWidth * 0.8); };
    A.$('[data-strip-prev]').addEventListener('click', function () { st.scrollBy({ left: -step(), behavior: A.RM ? 'auto' : 'smooth' }); });
    A.$('[data-strip-next]').addEventListener('click', function () { st.scrollBy({ left: step(), behavior: A.RM ? 'auto' : 'smooth' }); });
  }
})();
