'use strict';
// Procedural studio-style SVG car renders: hatchback, sedan, suv, mpv.
const SHAPES = {
  hatchback: {
    r: 36, wx: [200, 590], body: 'M78,288 L80,236 C80,222 88,214 100,208 L140,176 C158,160 190,154 240,152 L430,152 C480,154 520,176 548,200 L640,210 C690,216 718,232 722,258 L724,288 Z',
    win: ['M152,196 L148,181 C163,167 192,160 242,158 L324,158 L324,196 Z', 'M338,158 L430,158 C470,160 498,178 520,196 L338,196 Z'], door: 331, wy: 196, hl: [694, 226], tl: [80, 228]
  },
  sedan: {
    r: 36, wx: [190, 610], body: 'M70,288 L72,236 C74,224 84,218 104,216 L170,210 C190,200 215,190 250,172 C275,158 310,152 350,152 L460,152 C500,154 530,172 556,196 L650,206 C700,212 726,230 732,256 L735,288 Z',
    win: ['M250,194 C272,172 306,162 352,162 L402,162 L402,196 Z', 'M416,162 L462,162 C496,164 520,180 542,196 L416,196 Z'], door: 409, wy: 196, hl: [704, 226], tl: [74, 228]
  },
  suv: {
    r: 42, wx: [195, 605], body: 'M75,288 L75,215 C75,200 84,194 100,192 L168,186 L186,146 C190,138 198,134 210,134 L500,134 C530,136 548,150 566,176 L650,190 C700,196 726,214 730,245 L732,288 Z',
    win: ['M200,178 L214,146 L318,146 L318,178 Z', 'M332,146 L498,146 C516,148 530,158 546,178 L332,178 Z'], door: 325, wy: 178, hl: [702, 212], tl: [79, 208], cladding: true, rails: true
  },
  mpv: {
    r: 38, wx: [195, 605], body: 'M75,288 L75,222 C75,205 84,198 100,196 L150,188 C165,150 190,128 240,124 L470,124 C520,126 552,150 580,178 L655,196 C705,204 726,222 730,250 L732,288 Z',
    win: ['M178,182 C190,150 206,138 244,136 L300,136 L300,182 Z', 'M312,136 L384,136 L384,182 L312,182 Z', 'M396,136 L468,136 C506,138 532,158 556,182 L396,182 Z'], door: 306, wy: 182, hl: [704, 214], tl: [79, 214]
  }
};
function hex(c) {
  c = String(c || '').replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(c)) c = c.split('').map(x => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(c)) c = '1c1c1f';
  return c.toLowerCase();
}
function mix(h, to, p) {
  const n = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
  const t = to === 'w' ? 255 : 0;
  return '#' + n.map(v => Math.round(v + (t - v) * p).toString(16).padStart(2, '0')).join('');
}
function bodyTypeOf(t) {
  t = String(t || '').toLowerCase();
  if (SHAPES[t]) return t;
  if (/suv/.test(t)) return 'suv';
  if (/mpv|van|7/.test(t)) return 'mpv';
  if (/sedan/.test(t)) return 'sedan';
  return 'hatchback';
}
function render(type, color) {
  type = bodyTypeOf(type);
  const s = SHAPES[type]; const h = hex(color);
  const c0 = mix(h, 'w', 0.22), c1 = '#' + h, c2 = mix(h, 'k', 0.28);
  const R = Math.round(s.r * 1.12), cy = 320 - R, SX = 0.78, tx = (x) => Math.round(400 + (x - 400) * SX);
  const wheel = (x0) => { const x = tx(x0), r = R; return `<g><circle cx="${x}" cy="${cy}" r="${r}" fill="#0c0c0d"/><circle cx="${x}" cy="${cy}" r="${r - 7}" fill="url(#rim)"/>` +
    [0, 1, 2, 3, 4].map(i => `<rect x="${x - 2.4}" y="${cy - r + 9}" width="4.8" height="${r - 14}" rx="2" fill="#2a2a2e" transform="rotate(${i * 72} ${x} ${cy})"/>`).join('') +
    `<path d="M${x - 14},${cy - 10} A17,17 0 0 1 ${x + 8},${cy - 15} L${x + 4},${cy - 7} A9,9 0 0 0 ${x - 8},${cy - 4} Z" fill="#E10600"/>` +
    `<circle cx="${x}" cy="${cy}" r="6" fill="#d8d8dc"/><circle cx="${x}" cy="${cy}" r="2.4" fill="#555"/></g>`; };
  const arch = s.wx.map(x => `<ellipse cx="${x}" cy="${cy}" rx="${(R + 8) / SX}" ry="${R + 8}" fill="#050506"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400" role="img">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f5"/><stop offset=".62" stop-color="#e6e6e8"/><stop offset=".63" stop-color="#d4d4d7"/><stop offset="1" stop-color="#bdbdc2"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3340"/><stop offset=".55" stop-color="#0d1118"/><stop offset="1" stop-color="#1b222c"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".38"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="rim"><stop offset="0" stop-color="#9a9aa2"/><stop offset="1" stop-color="#3b3b41"/></radialGradient>
<radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<clipPath id="bc"><path d="${s.body}"/></clipPath>
</defs>
<rect width="800" height="400" fill="url(#bg)"/>
<ellipse cx="400" cy="326" rx="300" ry="20" fill="url(#sh)"/>
<g transform="translate(400 0) scale(${SX} 1) translate(-400 0)"><path d="${s.body}" fill="url(#body)"/>
<g clip-path="url(#bc)">${arch}
${s.cladding ? '<rect x="60" y="262" width="700" height="30" fill="#000" opacity=".35"/>' : ''}
<rect x="60" y="272" width="700" height="20" fill="#000" opacity=".28"/>
<path d="M60,${s.wy + 14} L760,${s.wy + 14}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
<rect x="-100" y="100" width="260" height="260" fill="url(#sheen)" transform="translate(${type === 'suv' ? 140 : 110} 0) skewX(-22)"/></g>
${s.win.map(w => `<path d="${w}" fill="url(#gl)"/><path d="${w}" fill="url(#sheen)" opacity=".35"/>`).join('')}
${s.rails ? `<path d="M215,${128} L495,128" stroke="#111" stroke-width="5" stroke-linecap="round"/>` : ''}
<path d="M${s.door},${s.wy + 2} L${s.door},282" stroke="#000" stroke-opacity=".4" stroke-width="2"/>
<rect x="${s.door - 28}" y="${s.wy + 14}" width="22" height="5" rx="2.5" fill="#000" opacity=".45"/>
<rect x="${s.door + 150}" y="${s.wy + 14}" width="22" height="5" rx="2.5" fill="#000" opacity=".45"/>
<path d="M${s.door + 215},${s.wy - 2} l22,6 l-3,14 l-20,-4 z" fill="${c2}"/>
<path d="M${s.hl[0] - 30},${s.hl[1]} l50,6 c6,1 8,5 6,10 l-52,0 z" fill="#f3f6ff"/><path d="M${s.hl[0] - 26},${s.hl[1] + 6} l40,5" stroke="#9ab" stroke-width="2"/>
<rect x="${s.tl[0]}" y="${s.tl[1]}" width="24" height="12" rx="4" fill="#c1121f"/>
<rect x="${s.wx[1] + s.r + 5}" y="268" width="${735 - s.wx[1] - s.r - 5}" height="12" rx="3" fill="#0a0a0a" opacity=".55"/>
<path d="${s.body}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.5"/></g>
${wheel(s.wx[0])}${wheel(s.wx[1])}
</svg>`;
}
module.exports = { render, bodyTypeOf };
