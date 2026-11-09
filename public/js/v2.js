/* v2 core (every page, ~1.5KB gz): kinetic word-split headlines, load sequence. Words, not letters, so Devanagari conjuncts never break. */
(function () {
  'use strict';
  var A = window.A, d = document, RM = A && A.RM;
  var splits = Array.prototype.slice.call(d.querySelectorAll('[data-split]'));
  function split(el) {
    var n = 0, label = el.textContent.replace(/\s+/g, ' ').trim();
    var tw = d.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], t;
    while ((t = tw.nextNode())) if (t.nodeValue.trim()) nodes.push(t);
    nodes.forEach(function (node) {
      var frag = d.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(' ')); return; }
        var w = d.createElement('span'), wi = d.createElement('span');
        w.className = 'w'; w.setAttribute('aria-hidden', 'true'); wi.className = 'wi'; wi.style.setProperty('--i', n++); wi.textContent = part; w.appendChild(wi); frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    var sr = d.createElement('span'); sr.className = 'sr'; sr.textContent = label; el.insertBefore(sr, el.firstChild);
  }
  splits.forEach(split);
  function reveal(el) { requestAnimationFrame(function () { el.classList.add('in'); }); }
  var go = function () {
    d.documentElement.classList.add('loaded');
    splits.forEach(function (el) {
      if (RM || !('IntersectionObserver' in window)) { el.classList.add('in'); return; }
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); reveal(el); } }, { rootMargin: '0px 0px -10% 0px' });
      io.observe(el);
    });
  };
  // wait briefly for webfonts so the rise happens with final metrics, but never block on them
  var done = false, run = function () { if (done) return; done = true; go(); };
  if (d.fonts && d.fonts.ready) { d.fonts.ready.then(run); setTimeout(run, 500); } else run();
})();
