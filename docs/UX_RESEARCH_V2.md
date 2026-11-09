# UX Research V2: Company A Motors (Brand X dealer, Lucknow)

Goal: outclass every dealership site with server-rendered HTML + vanilla JS + CSS + local `motion`. Budget: <=60KB gz JS per page, <2.5s on 4G, WCAG AA, reduced-motion safe, Hindi + English.

Research caveat: web search was limited (US-only, summarised results) and deep fetches of OEM sites were not possible. Items marked [verified] appeared in search results. The rest are patterns I know from those sites; re-inspect them in DevTools. Ideas and techniques only, no code copied.

## 1. Sources and what is worth borrowing

| Source | What impresses | Technique (likely) | Licence |
|---|---|---|---|
| Awwwards automotive https://www.awwwards.com/websites/automotive/ [verified] | Rivian (SOTD + Developer award), Fisker: cinematic scroll storytelling | scroll-linked frames/video, pinned sections | inspiration |
| Scout Motors https://www.awwwards.com/inspiration/animated-layouts-scout-motors [verified] | animated layouts, text + video animation | Locomotive smooth-scroll, split-text reveals (we skip the smooth-scroll lib) | inspiration |
| Autoklinika https://www.awwwards.com/inspiration/autoklinika [verified] | car configurator, scrolling illustration, detail page | layered image swap, scroll timeline | inspiration |
| Hispano Suiza https://www.awwwards.com/inspiration/homepage-scroll-hispano-suiza-cars [verified] | historic cars slider, video-player transition, timeline | horizontal slider, clip-path video expand | inspiration |
| Avatr Vision Xpectra https://www.awwwards.com/inspiration/scroll-slider-avatr-vision-xpectra [verified] | horizontal scroll, pricing-page scroll animation | pinned horizontal track | inspiration |
| Porsche, Lamborghini, Polestar, Lucid, Genesis, Tesla, Lotus, Range Rover (from knowledge) | giant type on near-black, one image per viewport, sticky spec bars, colour/wheel configurators | scroll-snap, condensing nav, image crossfades, big numerals | inspiration |
| Carvana, Cazoo, Spinny, Cars24 (from knowledge) | trust: 360 walkaround, inspection scorecards, EMI-first pricing, bottom-sheet filters | frame-based 360, badges, EMI slider | inspiration |
| Fireart roundup https://fireart.studio/blog/20-great-automotive-website-examples/ [verified] | Lamborghini video bg, Mercedes micro-animation | muted video loops, hover micro-motion | inspiration |
| js-cloudimage-360-view https://github.com/scaleflex/js-cloudimage-360-view [verified] | drag-to-spin 36-frame car viewer | drag delta maps to frame index | MIT |
| judo-spin https://github.com/Rodgath/judo-spin [verified] | tiny vanilla 360 spinner with car demo | same | MIT |
| CSSScript 3D viewer https://www.cssscript.com/3d-image-viewer/ [verified] | minimal frame viewer reference | same | MIT |
| motion.dev https://motion.dev/docs/animate [verified] | `motion/mini` 3.2KB, hybrid `animate` 22KB; springs by stiffness/damping/mass or duration/bounce; `stagger()` as delay | n/a | MIT |

Most useful: Awwwards automotive tags (pattern vocabulary), the Scout/Autoklinika/Hispano pages (configurator, horizontal track), motion.dev docs (mini vs hybrid byte budget), the MIT 360 viewers (we write our own ~1KB version).

Local skill (`ui-ux-pro-max`): pattern "Hero-Centric" (one dominant CTA; static hero and non-pulsing CTA under reduced motion; pause media offscreen); style "Motion-Driven" (3-5 parallax layers, 300-400ms hovers, page transitions; needs contrast 4.5, visible focus, reduced-motion); colour "Automotive/Car Dealership" (#1E293B, action red #DC2626, #F8FAFC bg, #475569 muted); typography hits "Kinetic Motion" (Syncopate + Space Mono: too gimmicky for a dealer) and "Luxury Serif" (Cormorant + Montserrat). `--domain ux/landing/chart` returned no DB match for this query and `motion` is not a valid domain, so tokens below are my own. Checklist adopted: SVG icons, cursor-pointer, focus rings, 375/768/1024/1440 breakpoints.

## 2. Design system

### Typography (all SIL OFL, self-host woff2, subset, `font-display: swap`)
- Display: **Inter Tight** variable 600/700, tracking -0.03em, `clamp(2.75rem, 8vw, 7.5rem)`, line-height 0.95.
- Accent: **Instrument Serif** italic, one word per headline ("Drive *home*"). Latin only.
- Body/UI: **Inter** variable 400/500, 16-17px/1.6.
- Hindi: **Noto Sans Devanagari** variable, subset, loaded only on `lang=hi` (~40KB). Line-height +0.15, no negative tracking, no italics, no uppercase.
- Prices: `font-variant-numeric: tabular-nums`; `Intl.NumberFormat('en-IN')` for lakh grouping.
- Budget ~45KB for two Latin files; preload the display only; `size-adjust` fallback to avoid CLS. Fallback stack: `system-ui`.

### Colour (one accent; day showroom + night showroom)
```
--ink:#0B0B0E  --ink-2:#17171C  --ink-3:#26262D        (night surfaces)
--paper:#FFFFFF --paper-2:#F5F4F2 --line:#E4E2DE        (day surfaces)
--text:#0B0B0E  --muted:#5C5A56 (AA on paper)  --muted-night:#A7A5A0
--crimson:#B3122D  --crimson-hi:#D7203D (hover, on night)  --crimson-ink:#8E0E23 (pressed)
--ok:#1F7A4D (inspection ticks only)
```
Rules: crimson only for CTA, active state, price delta, focus accent, never large fills except one CTA band. `.night` flips tokens (hero, model rail, test-drive band, footer). Focus ring: 2px paper + 4px crimson double ring. Contrast: crimson on white 6.6:1 (text ok); on ink about 3:1 (large text/fills only; use crimson-hi or white on crimson fill).

### Spacing and shape
8px grid; section padding `clamp(4rem,10vw,9rem)`; container 1280; gutter 16/24/40. Radius 4 inputs, 12 cards, 999 pills. Tonal surfaces and 1px lines over shadows; one lifted shadow `0 20px 60px -20px rgb(0 0 0/.35)` for car cards.

### Motion tokens
```
--dur-1:120ms press   --dur-2:240ms hover   --dur-3:480ms reveal   --dur-4:800ms hero/page   --dur-5:1200ms signature
--ease-out:cubic-bezier(.16,1,.3,1)   --ease-inout:cubic-bezier(.65,0,.35,1)   --ease-snap:cubic-bezier(.34,1.56,.64,1)
springs (motion): ui {stiffness:420, damping:34, mass:.8}   soft {stiffness:170, damping:26}   heavy {stiffness:90, damping:20, mass:1.2}
stagger: 40ms lists, 70ms headline words; total stagger capped at 600ms
```
Reduced motion: one flag `const RM = matchMedia('(prefers-reduced-motion: reduce)').matches`. Under RM: no parallax/scrub/marquee/cursor/autorotate; reveals instant; View Transitions duration 0; counters show final value. Progressive enhancement: content fully visible with JS off (inline head script adds `.js` to html; hidden initial states only under `.js`).

### JS architecture
`core.js` (~3KB: RM flag, reveal, nav, lang) on every page; page modules lazy-loaded via `data-module`. `motion/mini` (3.2KB) for reveals/hover; hybrid `animate/scroll/inView/spring` (~22KB gz) only on home, model, finder, booking. Prefer CSS `animation-timeline: view()/scroll()` under `@supports`, motion `scroll()` as fallback. Typical page 35KB gz, under the 60KB cap.

## 3. Blueprint (ranked by wow per effort)

Effort S (<0.5d), M (1-2d), L (3d+). Perf = cost to LCP/INP/bytes.

### P0: foundations that kill "mediocre"

**1. Type + night/day palette (sitewide; S; perf none; P0).** Giant tight headlines, serif-italic accent word, tabular prices, whitespace. `text-wrap: balance` on headings, `pretty` on paragraphs. A11y: AA per token. Single biggest upgrade for least effort.

**2. Cross-document View Transitions (all navigation; S; ~0 JS; P0).** `@view-transition { navigation: auto; }`. The clicked card's image gets `view-transition-name: car` on `pageswap`/`pagereveal` (only one named element, avoids dozens of names) so it morphs into the model-page hero. Header has its own name so it stays still. Root crossfade 350ms with slight translateY. Unsupported browsers navigate normally. RM: duration 0.

**3. Reveal system (sitewide; S; ~1KB; P0).** `[data-reveal]` via motion `inView`; `animate(el,{opacity:[0,1],y:[24,0]},{duration:.8,ease:[.16,1,.3,1]})`; images use `clip-path: inset(0 0 100% 0)` to `inset(0)`; children `delay: stagger(.06)`. One-shot. RM/no-JS: visible.

**4. Kinetic split-text headline (hero, section titles; S; ~0.8KB; P0).** JS wraps words (not letters, since splitting breaks Devanagari conjuncts) in overflow-hidden masks; inner span translateY(105%) to 0, 70ms stagger, 800ms ease-out, after `document.fonts.ready`. Heading keeps `aria-label`, spans `aria-hidden`. RM: no split.

**5. Magnetic buttons + press physics (hero CTA, Book test drive; S; ~1KB; P0).** Within 80px, translate by 0.25*offset with soft spring, spring home on leave; motion `press()` scale .97 with ui spring; fill sweep via `::before` clip-path from entry side. Only `(hover:hover) and (pointer:fine)`. Haptic-like: `navigator.vibrate?.(8)` on confirm actions only (shortlist, booking).

### P0: signature sections

**6. Hero "Night Garage" parallax car (home; M; image bytes only; P0).** Full-bleed dark scene; layers: outlined giant model word (stroke only) behind, cut-out car (AVIF ~60-90KB, `fetchpriority=high`, preloaded, width/height set) in the middle, masked flipped reflection on the floor, thin crimson light strip. Pointer shifts layers 6/14/24px with heavy spring; scroll scales car 1 to 1.12 and drifts it while headline lifts (`animation-timeline: scroll(root)`, motion `scroll()` fallback). Headline uses 4, CTA uses 5. Text is real HTML so LCP is fast. RM/mobile: static composition, scroll drift only on mobile; pause offscreen.

**7. Sticky horizontal model rail H/C/S/V (home; M; ~2KB; P0).** Wrapper 300vh, inner `position: sticky; top:0; height:100vh`; track translates with `scroll(animate(track,{x:['0%','-75%']}),{target:wrapper,offset:['start start','end end']})`. Each slide: huge model name, three numerals, "From Rs x lakh", CTA; crimson progress bar. Mobile and RM: native `overflow-x:auto; scroll-snap-type:x mandatory` strip (do not hijack vertical scroll on phones). All slides are real links in DOM order.

**8. Price reveal: on-road waterfall (model page + city select; M; ~3KB; P0).** Per-city JSON: ex-showroom, RTO, insurance, TCS, handling, accessories, optional warranty. Inline SVG waterfall, greys for components, crimson only for the final on-road bar, direct labels, no legend. Bars grow left to right on view (`scaleX`, origin left, stagger 90ms), total lands last with ui spring; city change re-flows bars. Hover/focus on a bar explains the fee. "View as table" toggle gives the accessible equivalent. One line: "Why Rs X more than ex-showroom?" RM: final state.

**9. EMI slider that filters cars live (home strip, /cars, /used; M; ~2.5KB; P0).** Native `<input type=range>` Rs 8k-80k/month, chips for down payment and tenure (36/48/60/84). Max on-road price from `P = EMI*(1-(1+r)^-n)/r`. Cards carry `data-onroad`; non-matching cards fade to .25 opacity, become `inert`, and FLIP to the end (not removed, so layout stays stable). Live count "7 cars fit Rs 22,000/month" in `aria-live=polite` (debounced 400ms), `aria-valuetext`. Shareable `?emi=22000` via `replaceState`. Rate/tenure assumptions visible.

**10. "Find my car" 4-question matcher (home band + /find; M; ~3KB; P0).** Native `<dialog>` night overlay, one big-card question per screen: who rides, where, budget by EMI (reuse 9), priority. Scoring table from server JSON; result: top match, a one-sentence why ("5 seats, 18 km/l, Rs 21k EMI"), two alternates, Book CTA. Transitions: out slides left, in springs. Radio groups, Back, Esc, `aria-live` result; sessionStorage; share link. Hindi copy written natively.

**11. Test-drive slot picker with calendar morph (booking; L; ~5KB; P0).** Steps: model cards, 7-day date rail (today first), time chips (booked ones disabled from server), name + +91 phone. Selected date chip morphs into the confirmation header via `document.startViewTransition` (FLIP fallback). Native inputs / `role=radio` chips; sticky summary bar on mobile; inline validation; showroom vs doorstep option. RM: instant swap.

### P1: trust, compare, mobile

**12. Colour-swatch bloom (model page; S; images only; P1).** 44px swatches; new image sits over old with `clip-path: circle(0 at swatch) to circle(150%)`, 500ms inout. Preload on `pointerenter`/idle. Name + stock ("2 ready in Lucknow") in `aria-live`.

**13. Drag 360 walkaround (model, each used car; M; ~1KB; P1).** 24-36 WebP frames (~15KB each), frame 0 first, rest on first interaction. Pointer drag to frame index, spring inertia, arrow keys, `touch-action: pan-y`, one auto-rotate hint (not RM). Used cars: 12 frames minimum, else gallery.

**14. Custom cursor with label states (desktop; S-M; ~1.2KB; P1).** 12px crimson dot + 56px ring on soft spring; `[data-cursor]` states DRAG (on 360/rail), VIEW (cards), PLAY (video). Fine pointers only, not RM; native cursor kept on inputs; one transform write per rAF; no blend modes.

**15. Compare table with sticky headers (/compare; M; ~2KB; P1).** Up to 3 items from a "Compare" pill with a shortlist tray (localStorage). Sticky header row (image, name, price) and sticky first column on mobile with scroll-snap; "highlight differences" toggle; best value gets a crimson dot plus the word "best". Semantic `<th scope=row>`.

**16. Used-car trust panel (used pages; M; ~1KB; P1).** 200-point inspection ring gauge (stroke-dashoffset), expandable categories, inspector name/date/photo, owner count, service timeline, return/warranty badges, accident-free statement. Needs real yard data; the strongest persuasion element (Cars24/Spinny/Cazoo logic).

**17. Mobile bottom-sheet filters (/cars, /used; M; ~2.5KB; P1).** Sticky "Filters (3) | Sort" bar; `<dialog>` sheet slides up on ui spring; drag handle with pointer events (dismiss at >120px or >600px/s); snap 60%/92%; "Show 23 cars" live-count apply button. Desktop: same markup as a sidebar via CSS. Native dialog traps focus.

**18. Spec counters + big numerals (model page; S; ~0.6KB; P1).** Four numbers (power, mileage, boot, safety) animate with `animate(0,v,{duration:1.2,onUpdate})` on view; final value server-rendered, so no-JS/RM shows it.

**19. Day/night tone shift on scroll (home; S; ~0.5KB; P1).** IO flips `body[data-tone]` at 50% viewport; only body background and `--fg` transition (600ms inout). Feels like walking into the showroom.

**20. Trust marquee (under hero; S; CSS only; P1).** Deliveries count, Google rating, awards, finance partners; duplicated content `aria-hidden`; 40s loop, pauses on hover/focus; RM becomes a static wrapped row.

**21. Fast-image discipline (sitewide; S; perf positive; P1).** AVIF/WebP `<picture>`, `srcset`, dominant-colour placeholder from server, `content-visibility:auto` + `contain-intrinsic-size` below the fold, `decoding=async`, explicit aspect-ratio. Speed is a premium signal on Indian 4G.

### P2: delight and polish

**22. Car card hover depth (cards; S; ~0.5KB; P2).** Image scale 1.04/600ms, spec row slides up with "From Rs 14,900/mo", crimson underline draws; heart shortlist with spring pop. Same on `:focus-visible`.

**23. EN | हिं toggle (header; S; ~0.8KB; P2).** Sliding-thumb pill (spring); real URLs `/hi/...` with `hreflang`, so the toggle is a link plus view-transition crossfade; cookie remembers. Latin digits for prices; test ~20% longer Hindi strings.

**24. Condensing sticky header (sitewide; S; ~0.6KB; P2).** Transparent over night hero; shrinks to 56px with blur after 80px, hides on scroll-down, returns on scroll-up; persistent "Book test drive" pill and call/WhatsApp icon on mobile; full-screen mobile menu with 70ms staggered links.

**25. Session-once intro curtain (home; S; ~0.4KB; P2).** SVG mark strokes in, crimson line wipes up. Max 900ms, overlays already-rendered content, skipped on repeat visits and RM; never blocks LCP.

**26. Service booking as a "ticket" (service; M; ~2KB; P2).** Model + registration, service checklist with indicative price ranges, reuse slot picker (11), pickup/drop toggle. Result is a perforated-edge ticket (CSS mask) printed by clip-path reveal, with client-side .ics "Add to calendar" and WhatsApp share.

**27. Scroll-scrubbed statement text (About; S; ~1KB; P2).** Words rise from 20% to 100% opacity with scroll progress (<=60 words), then named team photos and a Lucknow map link. Faces build local trust.

**28. Honest used-car ribbons (listings; S; 0; P2).** "Just in 2 days ago", "Price dropped Rs 15,000", real data only; dot pulses once, not infinitely. No fake scarcity.

**29. Sound off by default (all video; S; 0; P2).** `muted playsinline`, poster, `preload=metadata`, play only in view via `inView`, visible pause button (WCAG 2.2.2), no autoplay on `Save-Data` or RM. No sound effects in v1; any later engine-note is an off-by-default remembered toggle.

**30. Scroll "odometer" progress (model page; S; ~0.5KB; P2).** Thin right-edge line with a small car icon travelling as you scroll (`animation-timeline: scroll()`), ending at Book CTA. `aria-hidden`.

## 4. Signature moments

1. **Night Garage hero (6+4+5):** dark scene, depth-shifting car, rising headline words, crimson light strip, one magnetic CTA. Target LCP under 1.8s.
2. **Card-to-hero morph (2):** tapping a car makes its photo fly into the model hero; native-app feel for one CSS rule.
3. **Model Rail (7):** vertical scroll turns into a horizontal tour through H, C, S, V on a pinned dark panel with giant numerals.
4. **Price Reveal (8+18):** waterfall builds from ex-showroom to on-road for the chosen city; total lands with a spring. Transparent pricing is the brand claim and this makes it memorable.
5. **EMI Dial (9):** drag one slider and watch inventory rearrange around your monthly budget.
6. **Find My Car (10):** four big questions, one answer, a human sentence of why.
7. **Booking Confirmation (11+26):** the chosen date chip morphs into a ticket, a tick draws itself, advisor name and photo, add-to-calendar, WhatsApp share, "what to bring" list, short vibration on mobile.
8. **Colour Bloom (12):** new paint spreads out of the swatch you tapped.

## 5. Build order

Week 1: 1, 3, 4, 2, 5, 21, 24, 20. Week 2: 6, 7, 12, 18, 22, 19. Week 3: 9, 8, 10. Week 4: 11, 17, 15, 16, 13. Later: 14, 23, 25-30.

## 6. Guardrails

- Animate only `transform`, `opacity`, `clip-path` (FLIP helpers excepted); cap ~30 simultaneous animated elements; `will-change` only during animation.
- INP: passive/rAF-throttled handlers; prefer IO and scroll timelines over scroll listeners.
- No smooth-scroll libraries; native momentum feels fastest on mid-range Android.
- Every animation has a non-animated equivalent; every widget has a native-HTML base (range, dialog, radio, table).
- Test matrix: Moto G-class on throttled 4G, iPhone SE, 1440 desktop, Hindi, RM on, JS off, keyboard only, 200% zoom.
- Trust/legal: prices "indicative", EMI shows rate and tenure assumptions, no fake urgency.
- Licences: fonts OFL, `motion` MIT, 360-viewer repos are references only (MIT); all code written in-house.
