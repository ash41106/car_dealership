# QA Report - Company A Motors (Round 7: final verification)

Tester: QA lead. Fresh DB (port 3800, RATE_LIMIT_PUBLIC=5000), headless Edge via CDP, HEAD ce4587d plus working tree. No app code edited. New helpers in `tests/e2e/`: `r7_a.js` (budget CTAs), `r7_b.js` (Hindi prices), `r7_c.js` (filters-sheet Tab trap, first-visit font/CLS), `r7_w.js` (waterfall), `r7_tbt.js` (TBT attribution by stripping CSS features at the network layer via Fetch interception). Screenshots in `%TEMP%\qa7-shots` (`M6_h390.png`, `M6_h1440.png`, `fout_*`, `wf_*`). Note: on Git Bash set `MSYS_NO_PATHCONV=1` when passing `/` paths to perf6.js.

## Round 7 score: 88 / 100 (round 6: 84) - CLEARS 85, no Major defects open

| Area | Max | R7 | Why |
|---|---|---|---|
| Functionality | 30 | 29 | npm test 67/67, run.js 442/442, rbac.js 121/122 (by-design OTP lockout), browser3 112/112, customer 11/11. R6-01, R6-02, R6-03, R5-13, R5-16 verified fixed. |
| Backend / security | 20 | 17 | Not re-audited (UI-only commits); suites green. |
| Frontend UX / design | 20 | 19 | Mobile void gone; rail, strip cards, budget, waterfall, EMI bar clean. Photography still partly stock-like (7/10). |
| SEO / perf / a11y | 10 | 6 | CLS about 0, no console errors, no overflow, 0 small targets, contrast scan clean, all four keyboard traps pass. Stress-profile TBT still 0.5-2.0 s; some stress numbers slightly worse. |
| i18n + DPDP | 10 | 9 | Devanagari lakh in prices (finder, filters, budget); residual Latin only for product names and terms (Model H, EMI, SUV). |
| Deploy / docs / tests | 10 | 8 | Helpers added, no new deps. |
| **Total** | **100** | **88** | |

## Verification
- R6-01 (mobile void): FIXED. 390x844 step-scroll (12 frames, scrollHeight 8,735) shows stats, rail slides H/C/S/V, budget, offers, finder, locations, CTA and footer in order with no black void; only about 120 px of empty band under the stats. 1440x900 (12 frames) also clean.
- R5-16: FIXED. Cards visible on mobile; `r5_pages` reports no opacity-0 hidden elements on 15 pages x 2 viewports.
- R6-02 / R5-06: FIXED. Slider min (Rs 8,000): "0 cars match", both CTAs `aria-disabled=true`, `tabindex=-1`, `pointer-events:none`, opacity 0.4. Mid/max: 8 cars, CTAs enabled, max price consistent (Rs 4.76 / 26.19 / 47.61 Lakh). ArrowRight adds 1,000. Same at 390 and 1440.
- R5-13: FIXED. Waterfall total label clear of the bar; micro rows show visible markers.
- R6-03: FIXED. Hindi (cookie lang=hi): Devanagari lakh in finder results and used filters; no Latin "Lakh/Crore" on home, new-cars, model, used pages.
- Keyboard traps with real key events: finder dialog (14 Tabs stay inside), filters sheet (20 Tab + 6 Shift+Tab stay inside, Escape closes and returns focus to the trigger), lightbox (opens, focus inside), reserve sheet (focus inside dialog). Zero console errors.
- First-visit typography with swap: no visible FOUT. Cold, cache off, Fast 4G: all fonts `loaded` by the first frame captured (about 250 ms); frame 1 vs 2 differs only by CTA fade-in and a 5 px button shift. Layout shifts 0.0006 (390) and 0.0076 (1440, nav/header text). The Instrument Serif italic accent now shows on first view.
- Regression: 15 pages x 2 viewports: no horizontal scroll (1425 vs 1440 on desktop is the scrollbar), 0 targets under 44 px, contrast scan clean on 5 pages, no console errors.

## Performance (cache off, 5 runs, run 1 discarded; median / worst of runs 2-5; localhost, Edge headless)
| Profile | Page | LCP | TBT | CLS | KB |
|---|---|---|---|---|---|
| (a) Fast 4G, no CPU slowdown (primary) | Home 390 | 0.74 / 0.74 s | 15 / 16 ms | 0.0006 | 278 |
| | Home 1440 | 1.41 / 1.44 s | 18 / 22 ms | 0.0076 | 398 |
| | Model H 390 | 0.71 / 0.72 s | 26 / 27 ms | 0 | 152 |
| | Model H 1440 | 0.94 / 0.95 s | 24 / 26 ms | 0.0006 | 166 |
| (b) Fast 4G + 4x CPU (stress) | Home 390 | 1.33 / 1.46 s | 523 / 653 ms | 0 | 278 |
| | Home 1440 | 2.54 / 3.26 s | 1342 / 1455 ms | 0.0002 | 398 |
| | Model H 390 | 2.98 / 3.00 s | 2006 / 2109 ms | 0 | 152 |
| | Model H 1440 | 2.54 / 2.86 s | 1569 / 1898 ms | 0.0006 | 166 |
| (c) Slow 4G (0.4 Mbps, 400 ms), home | 390 | 2.12 / 2.12 s | 10 ms | 0.0023 | 338 |
| | 1440 | 5.49 / 5.53 s | 18 ms | 0.008 | 416 |

Versus R6: bytes down (mobile home 303 to 278 KB, desktop 469 to 398 KB), primary-4G LCP the same or better, Slow-4G mobile LCP 2.60 to 2.12 s and desktop 6.72 to 5.49 s. Stress TBT: mobile home slightly better (562 to 523), desktop home worse (1154 to 1342), model mobile worse (1716 to 2006), model desktop about the same (1759 to 1569); within lab noise.

Brief "under 2.5 s on 4G": MET on Fast 4G with no CPU slowdown (worst LCP 1.44 s, TBT under 30 ms, CLS under 0.01) and on mobile Slow 4G (2.1 s). NOT met under 4x CPU on the model page (about 3.0 s mobile) or desktop home (2.5-3.3 s), nor Slow 4G desktop home (5.5 s). The 4x-CPU profile is a harsh lab proxy; treated as Minor (R5-02).

### TBT attribution experiment: cause not found
`r7_tbt.js`, mobile model page, Fast 4G + 4x CPU, CSS declarations stripped from every stylesheet/HTML response, 4 runs each, median TBT: base 1454-2025 ms (swing about +/-400 ms between batches); no backdrop-filter 1150 then 2111 (contradictory); no box-shadow 1846; no filter 1630; no text-wrap 1770; no transform-style/will-change 1582; no mask/clip-path 1592; content-visibility:auto on sections 1623; `@view-transition` at-rule removed 1544 / 2094; view-transition-name removed 1577; transitions+animations removed 472 once (first run 1334; not confirmed). One "all view-transition" run showed 228 ms but did not reproduce (1555 and 1886 on repeat, identical DOM), so it is discarded. Conclusion: no single CSS feature is a reproducible cause; it remains two cold full-document layouts (R6 trace). Side observation: with `about:blank` between loads (true first visit) base TBT is about 0.76-0.82 s, versus 1.45-2.0 s when navigating from a same-origin page, so most of the stress TBT appears on in-site navigations (old-page teardown plus new full layout, or a view-transition/bfcache interplay; untested hypothesis).

## Photography: 7 / 10 (R6 6.5)
Colour-normalised, with a shared dark lower-third gradient, so hero, rail and cards read as one set; the Model H detail photo is clean (white hatchback, plate masked). Remaining: a real OEM badge on the grille (Tata logo), the gold hatch shot at an auto show with bystanders and booth signs in the rail. Not Major.

## Status of defects
| ID | Sev | Owner | Status |
|---|---|---|---|
| R6-01 | Major | Frontend | Fixed |
| R6-02 / R5-06 | Minor | Frontend | Fixed |
| R6-03 | Minor | Frontend | Fixed |
| R5-13, R5-16, R6-04 | Cosmetic/Info | Frontend | Fixed / verified |
| R5-02 | Minor | Frontend | Open: stress TBT 0.5-2.0 s; inline critical CSS so layout runs once, lazy-render rail slides 2-4 and the finder dialog |
| R5-14 | Minor (design) | Manager | Open: visible OEM badge, bystanders in rail photos |
| R7-01 | Info | Frontend | Mobile home: about 120 px empty band after the stats before "Four ways to drive" |
| R7-02 | Info | Frontend | Slow 4G desktop home LCP 5.5 s: serve the 800 px hero to desktop on slow connections |

Open counts: Major 0, Minor 2 (R5-02, R5-14), Info 2. Backend 0.

## Verdict
YES: 88/100, clears 85 with no Major defects. Remaining: stress-profile TBT, desktop Slow-4G hero, photography.

---

# QA Report - Company A Motors (Round 6: final verification)

Tester: QA lead. Fresh DBs (ports 3700-3702, RATE_LIMIT_PUBLIC=5000), headless Edge via CDP, commit 51fee4e. No app code edited. New helpers in `tests/e2e/`: `perf6.js` (profile x page x viewport, 5 runs, run 1 discarded), `trace6.js` (main-thread trace attribution), `layout6.js`, `montage6.js`, `imgsheet6.js`, `r6_void.js`, `r6_void2.js`, `r6_hi_a11y.js`. Screenshots in `%TEMP%\qa6-shots` (montages `M6_*.png`, `P_*.png`).

## Round 6 score: 84 / 100 (round 5: 84) - does NOT clear 85

| Area | Max | R6 | Why |
|---|---|---|---|
| Functionality | 30 | 28 | npm test 67/67, run.js 442/442, rbac.js 121/122 (by-design OTP lockout), browser3 112/112, customer 11/11. R5-01, 04, 05, 08, 09, 10, 12, 15 verified fixed. Deductions: R6-01, budget CTAs at minimum EMI. |
| Backend / security | 20 | 17 | Not re-audited (UI-only changes); suites green. |
| Frontend UX / design | 20 | 17 | Header tone, EMI bar, budget layout, graded photography all better. R6-01: about 1,700 px black void on the mobile home. Photography still stock-like. |
| SEO / perf / a11y | 10 | 6 | CLS about 0, JS cost small, no console errors, no overflow, targets pass. TBT under 4x CPU still high (home 0.56-0.87 s, model page 1.7 s). |
| i18n + DPDP | 10 | 8 | Hindi finder reasons and budget strings translated; "Lakh" stays Latin. Plates masked in every sampled variant. |
| Deploy / docs / tests | 10 | 8 | Helpers added, no new deps. |
| **Total** | **100** | **84** | |

## Performance (cache off, 5 runs, run 1 cold/discarded; median / worst of runs 2-5)
| Profile | Page | LCP | TBT | CLS | KB |
|---|---|---|---|---|---|
| Fast 4G, no CPU slowdown (primary) | Home 390 | 0.76 / 0.80 s | 14 / 15 ms | 0.0015 | 303 |
| | Home 1440 | 1.68 / 1.72 s | 17 / 17 ms | 0.0047 | 469 |
| | Model H 390 / 1440 | 0.82 / 0.84 ; 1.13 / 1.14 s | 21 ; 20 ms | 0.0001 | 158 ; 177 |
| | Used 390 / 1440 | 1.25 / 1.29 ; 1.46 / 1.49 s | 0 ; 0 | 0 | 215 ; 365 |
| Fast 4G + 4x CPU (stress) | Home 390 | 2.75 / 3.38 s | 562 / 874 ms | 0 | 303 |
| | Home 1440 | 2.88 / 3.00 s | 1154 / 1398 ms | 0.0048 | 469 |
| | Model H 390 | 2.61 / 2.65 s | 1716 / 1746 ms | 0 | 158 |
| | Model H 1440 | 1.63 / 2.72 s | 1759 / 1866 ms | 0.0001 | 177 |
| | Used 390 / 1440 | 1.04 / 1.15 ; 1.23 / 1.30 s | 786 / 818 ; 1013 / 1063 ms | 0 | 215 ; 365 |
| Slow 4G (0.4 Mbps, 400 ms) | Home 390 / 1440 | 2.60 / 2.62 ; 6.72 / 6.76 s | about 15 ms | 0.0015 / 0.0047 | 327 / 349 |
| Unthrottled | Home 390 / 1440 | 0.21 / 0.22 ; 0.37 / 0.42 s | 32 ; 72 ms | 0 / 0.0048 | 303 / 469 |

Cold first runs were worse (mobile home LCP 3.2 s, TBT 1.4 s; model TBT 2.5-2.7 s).
Brief "under 2.5 s on 4G": MET on the primary metric (Fast 4G, no CPU slowdown: LCP 0.76-1.68 s on all pages tested). NOT met under the 4x CPU stress (mobile home 2.75 s, model 2.6 s) nor Slow 4G desktop home (6.7 s; hero image + 469 KB).

### Main-thread attribution (mobile 390, Fast 4G + 4x CPU, trace)
Home TBT about 740-800 ms in 2-4 long tasks. JavaScript is not the problem (app.js eval about 70 ms on model page, about 0 on home).
1. First full-document Layout: 500-535 ms in one task (1,028 objects, partialLayout=false) plus UpdateLayoutTree about 85 ms. Same on model (433 ms, 673 objects) and used list (333 ms, 824 objects). Blocking all fonts still left 455 ms; blocking all CSS left 256 ms, so roughly half is cold-renderer text shaping (partly a headless-Windows artefact) and half is style-driven.
2. Second full Layout 215-250 ms when late CSS/fonts/hero arrive (root invalidated).
3. UpdateLayoutTree 70-90 ms + Paint/PrePaint about 30 ms; then script (model page 68 ms).
Steady-state subtree layout is cheap (largest section 8 ms at 4x), so the cost is the two cold root layouts.
Fixes: (a) inline critical CSS, load the rest non-blocking so layout runs once; (b) preload the body font, `font-display:swap` with metric-matched fallback (`size-adjust`/`ascent-override`); (c) `content-visibility:auto` + `contain-intrinsic-size` only on sections more than 2 viewports down (budget, offers, locations, footer), plus `contain:layout style` on cards; (d) render rail slides 2-4 and the finder dialog lazily (home DOM about 1,000 layout objects); (e) smaller hero bytes (about 120 KB) for Slow 4G.

## First-visit typography (font-display:optional)
Not jarring: the fallback is size-adjusted (CLS 0.0015 mobile) and Inter Tight loaded in every cold run. The visible loss is the Instrument Serif italic accent ("drive.", "monthly budget."), reported `unloaded` on first view, so it falls back to a generic italic and loses the signature. Recommendation: switch to `swap` plus `<link rel=preload as=font crossorigin>` for inter-tight and instrument-serif-italic (about 67 KB) with `size-adjust` fallbacks; CLS stays near 0 and the brand type shows on first paint.

## Photography: 6.5 / 10 (R5 about 4)
Grading and fixed crops work: hero, rail, cards and used grid share one palette and read as a set; plates are blurred in all 15 used variants and 8 sampled car variants at full size (`P_rear.png`, `P_used.png`: nothing legible; masks read as grey patches). Still cluttered: auto-show booths and bystanders (Model H gold, Model S side), real OEM badges and signs ("CRETA", "CITY", "VISITORS CAR PARKING"), over-saturated blue/red used cars. To raise it: cut-outs on one dark studio floor with reflection or a consistent reshoot, mask or crop badges/signs, per-image saturation normalisation.

## Status of earlier defects
| ID | Status |
|---|---|
| R5-01 EMI bar | Fixed |
| R5-02 perf | Open, downgraded to Minor: LCP met on Fast 4G; TBT high only under 4x CPU |
| R5-03 contrast | Fixed (scan clean on 5 pages); hero lead over brightest slides not pixel-sampled |
| R5-04 colour chips | Fixed (plain labels); bloom still unreachable in photo mode |
| R5-05 CTA slash | Fixed |
| R5-06 budget | Partly: controls beside grid now; CTAs at minimum still link to an empty list (R6-02) |
| R5-07 focus outline | Not re-verified |
| R5-08 ICS | Fixed: CRLF, UTC Z times (15:00 IST = 09:30Z), escaped comma, DTSTAMP Z |
| R5-09 booking polish | Fixed (past slots disabled) |
| R5-10 finder copy | Fixed (reasons match answers, prices labelled, Hindi OK) |
| R5-11 admin prices spacing | Not re-verified |
| R5-12 targets | Fixed (0 small targets, 15 pages x 2 viewports) |
| R5-13 waterfall | Partly: total label still touches bar end; micro rows still slivers |
| R5-14 photography | Improved; open (Manager), see rating |
| R5-15 header tone | Fixed |
| R5-16 reveal | Still present (Info): 4 cards at opacity 0 on mobile until swiped |
| R5-17 vibrate | Fixed (no console errors) |

## New defects
| ID | Sev | Owner | Defect / repro |
|---|---|---|---|
| R6-01 | Major | Frontend | Mobile home has about 1,700 px of black void after the rail strip. `public/css/home2.css` lines 123-124 (rail cap: `.mrail{height:calc(var(--n)*min(72vh,700px)+...)}`, `.rail-pin{height:min(100vh,960px)}`) come after the mobile media rule at line 65 (`.mrail{height:auto}.rail-pin{position:static;height:auto}`) and override it: `#rail` is 2,870 px at 390. Repro `node tests/e2e/r6_void.js`, `void_2500.png`, `M6_home_m.png` tiles 3-4. Fix: wrap the cap in `@media (min-width:900px)`. |
| R6-02 | Minor | Frontend | Budget at minimum EMI: "See new cars in budget" links to `/new-cars?maxPrice=476148` (0 cars) while counter says 0 cars; disable CTAs at 0. One probe showed a stale max-price read-out (Rs 12.39 Lakh) at 1440 for the min step vs 4.76 Lakh at 390. |
| R6-03 | Minor | Frontend | Hindi keeps Latin "Lakh" in prices; use the Devanagari word. |
| R6-04 | Info | Frontend | Not fully driven this round: finder dialog Tab containment (inconclusive in headless), filters sheet and lightbox keyboard flows. Reserve sheet opens with focus inside, no errors. |

Open counts: Major 1 (R6-01), Minor 5 (R5-02, R5-06/R6-02, R5-13, R6-03, R5-14 design counted under Manager), Info 2. Owners: Frontend all except R5-14 (Manager). Backend 0.

## Verdict
Large visual improvement and the brief's 4G target is met on the primary metric, but 84 does not clear 85 because of R6-01 (one-line CSS fix) and unresolved throttled-CPU TBT. Fix R6-01 and the budget CTA state: about 87. Add critical CSS plus font preload: about 89.

---

# QA Report - Company A Motors (Round 5: visual + functional review of the UI overhaul)

Tester: QA lead. Fresh seeded DBs (ports 3600-3603, RATE_LIMIT_PUBLIC=5000), headless Edge 157 via CDP, real viewports 1440x900 and 390x844, scrolled in steps with a viewport screenshot per step (never a tall window). No app code edited. New test helpers in `tests/e2e/`: `cdp5.js` (CDP helper), `scroll5.js` (step-scroll screenshots, hidden-element and counter probe), `perf5.js` (Fast 4G + 4x CPU, LCP/CLS/TBT/transfer, 3 runs), `r5_budget.js`, `r5_finder.js`, `r5_testdrive.js`, `r5_service.js`, `r5_pages.js` (CLS, targets, hidden elements on 15 pages x 2 viewports), `r5_rm_cursor.js`, `r5_contrast.js`, `r5_viewtransitions.js`. Screenshots: `%TEMP%\qa5-shots` (about 160 PNGs; montages `M_*.png`).

## Round 5 score: 84 / 100 (round 4: 87)

| Area | Max | R5 | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 27 | npm test 67/67, run.js 442/442, rbac.js 121/122 (the one fail is the by-design mock-OTP lockout expectation), browser3 112/112. Budget slider, Find-my-car dialog (keyboard end to end), waterfall per city (6 cities, totals change correctly), date-rail booking for test drive and service, slot polling (a booking in one session dropped "6 bays left" to 5 in the next), confirmation ticket, filter bottom sheet, compare tray, View Transitions, reduced motion all work. Deductions: EMI bar broken (R5-01), colour bloom unreachable on every seeded model (R5-04), finder copy/price inconsistencies (R5-10), past slots called "Taken" (R5-09). |
| Backend / security | 20 | 17 | Not re-audited this round (UI-only change set); regression suites green; carried from R4 with R4-02/R4-03 not re-tested. |
| Frontend UX / design | 20 | 18 | Genuinely distinctive: night hero with word-by-word headline, pinned rail, tickets, waterfall, 100-point rings. Held back by photography (R5-14), the broken EMI bar, a few legibility/consistency issues below. |
| SEO / perf / a11y | 10 | 6 | CLS excellent (0 to 0.013 everywhere), fonts load, no console errors, focus visible on 40/40 tab stops, no horizontal scroll, no FOIT jump. But throttled TBT 1.0-2.7 s and mobile home LCP 1.5-3.8 s (R4: 1.3-1.6 s) (R5-02); contrast failures (R5-03); 38 px wide language toggle (R5-12). |
| i18n + DPDP | 10 | 8 | Hindi uses Noto Sans Devanagari (loaded); the 96 px headline at line-height 1.12 renders matras without clipping; no overflow at 390/1440. One unconfirmed rail price clipping in Hindi (R5-16). |
| Deployability / docs / tests | 10 | 8 | New helper scripts are syntax-checked; no new dependency; docs not re-reviewed beyond FRONTEND_NOTES. |
| **Total** | **100** | **84** | |

## (a) The "1000 px black band" and "1 / 1 / 25" counters: capture artifact, not a bug
- At 1440x2600 the rail wrapper is `100vh` per slide (`.rail-pin{height:100vh}`, JS sizes the scroller from vh): I measured the rail at **8,840 px** in a 2600 px window versus about 3,600 px at 900. A full-page capture with a tall window inflates the pin and centres a 450 px card in 2600 px of black.
- Real scrolling at 1440x900 and 390x844 (`home_d_01..05`, `home_m_*`): the trust band ends about 250 px before the "Four ways to drive" heading, the rail pins, advances H to C to S to V (progress bar and labels update), unpins cleanly, and the budget section follows with no void. Counters ended at **6,000+ / 3 / 2 / 100 / 5** at both viewports and under reduced motion. The "1/1/25" capture was taken a few hundred ms after the counters' IntersectionObserver fired, all at once in the tall window.
- Residual, low: a genuinely tall portrait monitor would show the oversized rail. Cap it (`height:min(100vh,960px)`) if that matters.

## Measurements (Fast 4G 1.6 Mbps / 150 ms RTT, 4x CPU, cache off, 3 runs; TBT = long tasks over 50 ms)
| Page | Viewport | LCP (3 runs) | CLS | TBT | Transfer |
|---|---|---|---|---|---|
| Home | 1440 | 2.0 / 3.3 / 3.6 s | 0.005 | 0.98 / 2.14 / 2.39 s | 680 KB |
| Home | 390 | 3.8 / 3.2 / 3.0 s (a separate run: 1.5 s, hero IMG) | 0 | 2.73 / 2.29 / 1.19 s | 327 KB |
| Model H | 1440 | 3.1 / 1.7 / 2.7 s | 0.0006 | 2.08 / 1.12 / 1.60 s | 181 KB |
| Model H | 390 | 2.8 / 1.7 / 3.1 s | 0 | 1.93 / 1.44 / 2.08 s | 158 KB |
| Used list | 1440 | 2.8 / 2.8 / 3.3 s | 0 | 1.28 / 1.19 / 1.75 s | 360 KB |
| Used list | 390 | 2.7 / 3.0 / 2.9 s | 0 | 1.75 / 1.63 / 1.59 s | 212 KB |

Unthrottled mobile home LCP 0.41 s. Run-to-run variance is large (lab noise), but the trend versus R4 (mobile home LCP 1.3-1.6 s) is worse.

## Defects (ID / severity / owner / repro / evidence)
| ID | Sev | Owner | Defect | Repro / evidence |
|---|---|---|---|---|
| R5-01 | Major | Frontend | EMI stacked bar: the principal segment and its legend swatch are `#fff` (`.b-pr{background:#fff}` in detail2.css) on a white page, so only two slivers (grey down payment, red interest) show with a blank gap between. | `/used-cars/uc-1182-model-c-vx-2022`, "EMI calculator", both viewports. `M_used_d2.png`, `M_used_m1.png`. Use a mid-grey or ink colour. |
| R5-02 | Major | Frontend | Throttled main-thread cost on home is high: TBT 1.0-2.7 s, desktop 680 KB, mobile LCP regressed vs R4. Candidates: fx.js + home2.js + the 184 KB `motion-dom.js`, parallax/tilt/word-split work at load, 4 hero slides. | `node tests/e2e/perf5.js`. Defer non-hero JS to idle, split headline words server-side, load motion-dom only on interaction. |
| R5-03 | Minor | Frontend | Contrast: "Find my car" peek list `.fd-peek li{color:#4b4b55}` on `#0b0b0e` = **2.47:1** (real text, fails AA); crimson script eyebrows on night 4.25:1; mobile hero lead paragraph over the brightest slides worst-case about 4.1:1. | `home_d_08.png`; pixel sampling of `hero_390_0/3.png`. |
| R5-04 | Minor | Frontend / Manager | Colour bloom is unreachable: all four seeded models are in photo mode, which renders non-interactive colour chips (`ul.colchips`) styled like pill buttons plus "Photo shows one colour". The advertised swatch bloom never appears and the chips look clickable. | `/new-cars/model-h` (`M_model_d1.png`). Supply per-colour photos or style the chips as plain labels. |
| R5-05 | Minor | Frontend | Final CTA band: the crimson diagonal slash runs through the headline and subtext on mobile ("Your drive starts here", "keys"). | Home at 390, bottom (`M_home_c.png`, tile 3). |
| R5-06 | Minor | Frontend | Budget section: on desktop the controls card is about 610 px tall and the filtered grid starts below the fold, so the user cannot see cars rearranging while dragging (the headline interaction of the section). At minimum EMI the CTAs ("See new cars in budget") still link to an empty list. The last row can orphan a single card (7 cars). | `budget_1440_MIN.png`. Put the live count and top cards beside the slider; disable CTAs at 0. |
| R5-07 | Cosmetic | Frontend | Programmatic `focus()` on step headings, results heading and the booking ticket paints a heavy double red/white outline (`finder_*_res`, `M_td_m.png`). Right for keyboard users, but it is a thick box around a heading; soften. Dialog open focuses the x button rather than the question. | `r5_finder.js`. |
| R5-08 | Minor | Frontend | `.ics` is sloppy: `DTSTART;TZID=Asia/Kolkata` with no `VTIMEZONE`, `DTSTAMP` in local time without `Z`, unescaped comma in `LOCATION`, no final CRLF. Outlook may treat times as floating. Content is otherwise correct (UID, SUMMARY, 45/90 min DTEND, location, right date and time). WhatsApp link `https://wa.me/?text=<encoded title - model - showroom, weekday, date, time>` is correct. | `r5_testdrive.js` prints the blob. Use UTC `...Z` times or add VTIMEZONE; escape commas. |
| R5-09 | Minor | Frontend | Booking polish: slots earlier than now on today's date read "Taken" (should be "Passed"); on 390 the step circles 3 and 4 sit higher than 1 and 2; step 1 model tiles are the old cartoon side-view SVGs beside photographic cards elsewhere. | `td_390_*`, `M_td_m.png`. |
| R5-10 | Minor | Frontend | Find-my-car results: reason copy says "Model H seats your group comfortably" for a "Just me" answer; prices shown are on-road but unlabelled and differ from the card's "From Rs 9.85 Lakh"; on desktop the results step scrolls inside a 370 px dialog and hides Back/Start again below the fold. | `M_finder_d.png`. |
| R5-11 | Minor | Frontend | Admin Prices live preview ("How the price builds up"): no gap between label and amount ("Ex-showroom price Rs 9,85,000" run together, "...Model H-Rs 15,000"). | `/admin/prices` at 390, `M_staff_m.png`. |
| R5-12 | Minor | Frontend | Targets: the language toggle is 38x44 on every page; Credits links are 20 px tall. | `r5_pages.js`. |
| R5-13 | Cosmetic | Frontend | Waterfall: the total label overlaps the end of the full-width red bar and clips the rupee glyph; micro rows (FASTag Rs 600) render as 2 px slivers. | `M_model_d1.png`, right tile. |
| R5-14 | Major (design) | Manager | Photography is the main thing keeping this from "showroom": cluttered real-world shots (auto-show booths, bystanders, parked cars, smudged plates), real OEM badges under made-up "Model X" names, inconsistent crops and lighting between cards. See critique. | `home_d_02..04.png`, `M_used_d1.png`. |
| R5-15 | Minor | Frontend | After the dark hero the header flips to a white bar and stays white over the night rail and finder sections, breaking the Night Garage mood. | `home_d_01..08.png`. |
| R5-16 | Info | Frontend | Not fully verified: (1) mobile home leaves 6 `.reveal` cards at opacity 0 until swiped horizontally (they reveal on intersection, but a fast fling could show blanks); (2) Hindi rail at one scroll position showed the price clipped at the right edge and a stray "5" glyph (`M_hi_d.png`), probably mid-scroll transform, not reproduced at rest. | |
| R5-17 | Cosmetic | Frontend | `navigator.vibrate` logs a console intervention in automation when the ticket opens (no real gesture); harmless for real taps, but guard with `navigator.userActivation.isActive`. | `r5_testdrive.js`. |

Defect count: 17 (Major 3: R5-01, R5-02, R5-14; Minor 9; Cosmetic 4; Info 1). Owners: Frontend 15 (R5-04 shared with Manager), Manager 2 (R5-14, R5-04), Backend 0.

## Verified working (no defect)
- Hero: crossfade across 4 slides (only the active slide has opacity 1), Ken-Burns/parallax run, controls and dots work, CLS 0.005.
- Rail: desktop pinned horizontal H/C/S/V with progress bar and labels; mobile `position:static` snap strip; reduced motion keeps everything visible.
- Budget slider: 8,000 to 80,000 step 1,000; min = 0 cars and "Nothing fits this budget yet", mid/max = 8 cars, keyboard arrows work, FLIP reflow, links carry `maxPrice` (`/new-cars?maxPrice=1200000` = 1 car, `/used-cars?maxPrice=900000` = 11 cars all within limit, `maxPrice=100` = empty-state message). Same at 390.
- Find-my-car: opens from keyboard (Enter), validation message when nothing is selected, radios by Space/arrows, EMI slider by arrows, 3 ranked results, Esc closes and returns focus to the opener, at both viewports.
- Model page: 6 cities (Lucknow and Kanpur Rs 10,85,935; Varanasi 10,87,420; Prayagraj 10,86,235; Gorakhpur 10,87,620; Delhi NCR 10,76,300 with 7% road tax), waterfall re-renders each time, sticky price bar appears on scroll and does not overlap the footer; mobile has a bottom CTA bar that clears the footer.
- Used detail: inspection ring (99) and 100-point rows (rings partial at 9/10), timeline, reserve CTA. Test-drive and service flows reach the ticket with correct date block, consultant, what-to-bring list, `.ics` and WhatsApp link.
- View Transitions: screencast of home to new-cars, new-cars to model, used list to detail shows no blank or white frame (frame luminance stddev never below 26).
- Cursor: native cursor kept on body and inputs (the custom ring is additive); forms and selects usable. Focus: 40/40 tab stops show an outline; skip link first.
- Fonts: Inter Tight, Inter, Noto Sans Devanagari report `loaded`; size-adjusted fallbacks keep CLS at or below 0.013.
- No console errors or failed requests on 15 pages x 2 viewports (apart from my deliberate probe of a non-existent `/sell`, which correctly 404s); no horizontal scroll at 390 or 1440.
- Staff/admin restyle: dashboard, lead inbox, prices render cleanly at both viewports (only R5-11).

## What still feels mediocre (design critique)
1. **Photography is the ceiling.** Type, motion and layout are premium; the images are not. Auto-show floors, people in the background, smudged plates and real manufacturer badges undermine the Night Garage story. Fix: one consistent studio treatment (cut-outs on a graded dark floor with soft reflection), or at minimum a uniform crop, darker vignette and lowered-saturation grade over every card so mixed sources read as a set. "Model V" on an Ertiga invites confusion.
2. **The night/day split is inconsistent.** A white header, white cards and a bright budget section interrupt the dark mood; the hero is the only truly cinematic moment. Make the header adapt (dark over night sections) and give budget, offers and locations a toned surface (warm grey rather than pure white) so the page has one rhythm.
3. **Spacing rhythm is uneven.** About 250 px of dead space after the trust band, 100 px of black below the rail, then a hard white cut; the budget card and the grid it controls are separated by a screen of white. Pick one vertical rhythm (for example 96/128 px) and align section transitions.
4. **Hierarchy repeats itself.** The same red-script eyebrow "More than a car" opens both the rail and the finder; the hero stacks three headline-scale items plus a ghost word behind everything; the ghost model letters in the rail collide with the price numbers. One idea per fold.
5. **Content pages are plain.** Compare is a stock table with mismatched image ratios; the variants table shows bare "Features" links; specs are three thin columns; test-drive step 1 uses cartoon SVG tiles. These feel like a different site from the hero.
6. **Waterfall and rings are good ideas with a rough finish**: the broken EMI bar (R5-01), clipped total label (R5-13), and tiny slivers for small charges. Use a minimum bar width and put the label outside the bar.
7. **Legibility**: 2.5:1 grey list on black, crimson script at 4.25:1, hero paragraph over bright slides near 4.1:1 on mobile.
8. **The budget interaction hides its payoff.** The cars rearranging happens off-screen on desktop. Put the live count and top three cards beside the slider.

## Verdict: does it "outcast" typical dealership sites?
Largely yes on interaction and typography. The pinned model rail, live budget filter, Find-my-car dialog, price waterfall, booking tickets with calendar and WhatsApp, and the clean motion and reduced-motion behaviour put it well ahead of the usual dealer template (dense banner carousels, pop-ups, stock grids). It stops short of "premium showroom" because the photography and some inconsistent surfaces read as a strong template filled with mediocre assets, and because the cost of the motion layer on a throttled phone is visible (TBT above 1 s). Fix R5-01 and R5-02, the contrast items, and re-grade or reshoot the imagery, and it moves from "clearly better than average" to "memorable".

---

# QA Report - Company A Motors (Round 4)

Tester: QA lead. Fresh seeded DBs (ports 3500-3520, RATE_LIMIT_PUBLIC=5000), headless Edge via CDP, commit 20c1d96. No app code edited. Tests changed/added: `tests/e2e/run.js` (CSV-import block now really logs in as lead_desk; the round-3 note claiming this was done was wrong) and new `tests/e2e/browser4.js` (modes `perf`, `pages`, `a11y`, `misc`, `probe`). Note: run.js and rbac.js must each run against a fresh DB (login lock-outs carry over between suites).

## Round 4 score: 87 / 100 (round 3: 79)

| Area | Max | R4 | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 28 | `npm test` 61/61, run.js 442/442, rbac.js 121/122 (the one fail is the mock-OTP expectation, by design), browser3 112/112, customer flow 11/11. Roles save bar + confirm dialog, sticky story, lightbox, compare tray, saved hearts, mobile nav verified in a browser. Deductions: UC-1188 has no photo (R4-06); lightbox is mouse-only (R4-04). |
| Backend / security | 20 | 17 | R3-02/06/12 verified fixed; production OTP fail-closed verified (503, 123456 rejected, no dev_otp); upgrade from a round-2-era DB and seed idempotency OK. Deductions: production first boot auto-seeds Admin@123 etc. with no forced change and no bootstrap alternative (R4-02, Major); content_editor can still alter on-road price via offer active/model_id (R4-03). |
| Frontend UX / design | 20 | 16 | Home, hero, story, staff shells look cohesive; no console errors, broken images or horizontal scroll on 12 public + 8 staff pages at 390 and 1440. Plates masked on all 31 photos inspected. Deductions: real OEM badges and mixed-make galleries (R4-05), clipped role-matrix headers / truncated desk select (R4-07), stale SVG on UC-1188 (R4-06). |
| SEO / perf / a11y | 10 | 7 | Big win (numbers below). Deductions: desktop throttled LCP 2.2/2.6 s with one 10.4 s outlier; filters drawer has no focus move/trap/dialog role and lightbox is not keyboard-openable (R4-04). |
| i18n + DPDP | 10 | 8 | Hindi complete on all new strings checked; leftovers in R4-08. DPDP flows pass. Deduction: unmasked plate photos remain in public git history (R4-01). |
| Deployability / docs / tests | 10 | 8 | README login table and commands work as documented. Dockerfile reviewed statically: node:22-alpine, COPY paths exist, non-root user, VOLUME, HEALTHCHECK fine (not built, N-02). Deductions: R4-02, R4-09, Docker unbuilt. |
| **Total** | **100** | **87** | |

## Home page measurements (cache disabled; Fast 4G = 1.6 Mbps, 150 ms RTT, 4x CPU; 3 runs)
| Viewport | Transferred, initial load | After scrolling whole page | LCP unthrottled | LCP throttled (3 runs) |
|---|---|---|---|---|
| Mobile 390 | 291 KB | 461 KB | 0.53-0.62 s | 1.26 / 1.35 / 1.59 s (LCP element = H1 text) |
| Desktop 1440 | 454-829 KB (varies with hero timing) | 1,040 KB | 0.34-0.75 s | 2.24 / 2.60 / 10.39 s (hero IMG; the 10.4 s run is a real outlier) |

Round 3 was 2.69 MB and 7.5 s, so R3-03 is fixed on mobile and mostly on desktop; the desktop worst case should be watched (preloading the first hero variant would stabilise it).

## Status of earlier defects (each reproduced)
| ID | Status |
|---|---|
| R3-01 fx.js crash | Fixed: 0 console errors on all pages; lightbox, drawer, ring init. |
| R3-02 content_editor price edits | Fixed for amount/type/show_in_onroad/accessories (403 with clear message). Residual: R4-03. |
| R3-03 home weight/LCP | Fixed on mobile; desktop outlier noted above. |
| R3-04 sticky story | Fixed: story visual holds top=96 px while scrolling the section, releases at the end. |
| R3-05 legible plates | Fixed: 15 used + 16 car photos inspected (contact sheets + 3x crops); responsive variants match the masked masters. Masks look like grey blur patches (cosmetic). |
| R3-06 password policy | Fixed: min 10, 3 of 4 classes, common-password list, same-as-current rejected. |
| R3-07 README/docs stale | Fixed (login table accurate); trivial gap R4-09. |
| R3-08 /account 401 console error | Fixed. |
| R3-09 duration format | Fixed: "Breached +25d 15h". |
| R3-10 roles save/confirm | Fixed, browser-verified: "1 unsaved change / Discard / Review and save" bar; confirm dialog lists the diff. |
| R3-11 branded/duplicated photos | Partly fixed: restricted hero-road replaced, duplicates gone; see R4-05. |
| R3-12 assignable roles | Fixed: reassign to content_editor / service_advisor returns 422, to a consultant 200. |
| D-12 hard-coded stats | Fixed: /api/settings/public drives the figures. |
| N-02 Docker not built | Still open (Manager): no Docker available; static review only. |

## New defects
| ID | Sev | Owner | Description / repro |
|---|---|---|---|
| R4-01 | Major | Manager | Origin history still contains unmasked plate photos and the restricted `hero-road.jpg`: `git log --all --name-status -- public/img` shows them added in b733cf3 and only modified/deleted in 6f1f49b..20c1d96, so `git show b733cf3:public/img/used/uc-1182.jpg` yields the unmasked file. `docs/_originals_private` itself is untracked, git-ignored, never in history and returns 404 over HTTP (good). Needs a history rewrite (filter-repo) + force-push, or an explicit risk acceptance. |
| R4-02 | Major | Backend | `NODE_ENV=production` on an empty DB (Dockerfile default) auto-seeds demo data including admin@companya.in / Admin@123 and the other published passwords, `must_change_password` not set. `AUTO_SEED=0` leaves no admin and there is no bootstrap (no ADMIN_EMAIL/ADMIN_PASSWORD). Add env-based first-admin bootstrap, skip demo seed in production, force change. |
| R4-03 | Minor | Backend | content_editor `PUT /api/admin/offers/1 {"active":0}` or `{"model_id":null}` returns 200 and removes a cash offer from the on-road price (amount/type/show_in_onroad are blocked). Gate under the price permission or document. |
| R4-04 | Minor | Frontend | A11y: used-cars filters drawer (390 px): focus does not move into it, Tab leaves it, no role="dialog"/aria-modal. Gallery lightbox opens by mouse only (image not focusable), focus is not restored on close, and the used-car detail page did not open a lightbox in my run. Esc, aria-expanded, burger, skip link, hearts (aria-pressed + persistence) pass. |
| R4-05 | Minor | Manager | Stock photos show real OEM badges/signage (Kia, Hyundai, Tata, Skoda dealership, Honda "CITY") under a fictional "Brand X" dealer; galleries mix makes (Model H: Tata exterior + Suzuki interior; Model V: Suzuki exterior + Kia interior). Scenes are London, Scottish hills, B&W vintage car. Disclosed in credits/README, so Minor. |
| R4-06 | Minor | Frontend | UC-1188 (Model S VX 2020) has no photo: the list card shows the new Model S stock photo (wrong colour), the detail page shows SVG illustrations (stale fallback); `/api/used` `image` fields are still `/img/car/*.svg`. |
| R4-07 | Minor | Frontend | Role-matrix column headers clipped ("WORKSHOP MANA", "USED-CAR MANAG"); SLA desk consultant select text truncated ("Rahul Verma (2"). |
| R4-08 | Trivial | Frontend | Hindi leftovers: /account noscript line, used-car inspection notes, yard address, colour "White". |
| R4-09 | Trivial | Manager | README page table omits /staff/desk, /staff/service, /exec, /admin/roles. |

## Other checks (no defect)
Production OTP fail-closed; seed run twice leaves counts unchanged (17 users / 60 leads / 21 used); a round-2-era DB upgrades and serves pages (new colour/body-type photo alignment applies only to fresh seeds, as stated); `/docs/*`, `/server/*`, `/data/` return 404; reduced-motion leaves no infinite animations on home; compare tray, empty compare and no-results states are sensible; mobile nav toggles and closes on Esc; CSP/nosniff/X-Frame-Options present. One transient CDP timeout during a staff-page sweep did not reproduce.

Defect counts: Critical 0, Major 2 (R4-01, R4-02), Minor 5 (R4-03..R4-07), Trivial 2 (R4-08, R4-09), plus N-02 (Manager, open).

---

# QA Report - Company A Motors (Round 3)

Tester: QA lead. Fresh seeded DB, port 3400 (RATE_LIMIT_PUBLIC=5000), headless Edge via CDP. No app code edited. New/updated tests: `tests/e2e/rbac.js` (122 API checks: RBAC, sessions, OTP, CSRF, forced change), `tests/e2e/browser3.js` (visuals + perf), `browser3_customer.js` (account flow), `browser3_staff.js` (every role UI), `probe.js` (ad-hoc CDP probe); `run.js` CSV-import section now logs in as lead_desk (consultants lost `lead.import` by design). Rounds 2 and 1 follow unchanged.

## Round 3 score: 79 / 100 (round 2: 91)

| Area | Max | R3 | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 26 | Customer OTP login, prefill, test-drive booking, cancel, add vehicle, saved cars, export, delete request, withdraw consent and sign-out all work in a real browser. Every role's menu/landing/pages are correct; desk assign, service-board move, role-matrix edit work. Deductions: story section visual does not stay sticky (R3-04); lightbox, inspection-ring animation and filters drawer never initialise because of a JS crash on every page (R3-01). |
| Backend / security | 20 | 16 | Strong: dealer_principal 403 on all 51 mutating calls; consultant/manager/advisor data scoping; AI band only admin+used_manager; role edit effective on live sessions and audited; logout, revoke-all, deactivate, role-change all kill live sessions; forced-change gate; login lock (429 after 5); CSRF text/plain blocked; customer/staff cookies isolated; customer data isolation. Deductions: content_editor can change price inputs (R3-02, Major); password policy is length-only (R3-06). |
| Frontend UX / design | 20 | 15 | Real photos plus cinematic hero, marquee, tilt cards, compare tray, staff shell and exec dashboard look premium and cohesive; staff pages have no horizontal scroll at 390. Deductions: broken sticky story (R3-04), legible number plates (R3-05), duplicated/branded photos (R3-11), minor staff UI issues. |
| SEO / perf / a11y | 10 | 6 | HTML 6 KB gz, CSS 11 KB gz, JS 6 KB gz, images cached 30 days. But home transfers 2.69 MB (target 1.5 MB) and LCP is 7.5 s on throttled 1.6 Mbps/150 ms/4x CPU (R3-03); a console exception on every page (R3-01). No horizontal scroll at 390 and no broken images on any public page tested. |
| i18n + DPDP | 10 | 9 | Hindi works on /compare, /account, /credits and home. Export/delete/withdraw requests recorded and audited. Staff UI English only (documented). |
| Deployability / docs / tests | 10 | 7 | `npm test` 53/53. README login table and docs are stale (R3-07). Docker still unbuilt (N-02). |
| **Total** | **100** | **79** | |

## Round 2 open items
| ID | Status |
|---|---|
| D-12 | Still open (Minor, Frontend): home still shows hard-coded "6,000+ / 900+". |
| N-01 | Fixed: AI summary now reads "model not specified yet". |
| N-02 | Still open (Manager): no Docker on QA machine; Dockerfile not build-tested. |

## Suite results
- `npm test` 53/53. `node tests/e2e/run.js`: all pass except the CSV-import block, which logged in as a consultant (now correctly 403); test updated to lead_desk.
- `tests/e2e/rbac.js`: 118/122. The 4 fails: 2 real defects (R3-02 x2), 1 test artefact (password reused after the policy probe), 1 expectation of OTP lock in mock mode (mock accepts 123456 by design; with OTP_MODE=real wrong codes get 400/401, no bypass). Page matrix 200/403 confirmed for admin, principal, desk, manager, consultant, used, content, service, workshop roles.
- Browser: customer flow 7/11 and public sweep 88/112; every failure is the R3-01 console exception (functional checks pass).

## New defects (round 3)
| ID | Sev | Owner | Issue and repro |
|---|---|---|---|
| R3-01 | Major | Frontend | `public/js/fx.js:64`: `A.$('.stage img.stage-img, .gal img').filter(...)`. `A.$` is querySelector, so this throws `TypeError ... reading 'filter'` on EVERY public page. Everything after it never runs: gallery lightbox, inspection-ring animation (line 76), filters drawer (line 77). Fix: use `A.$$`. |
| R3-02 | Major | Backend | content_editor can change prices. Log in as content@companya.in: `PUT /api/admin/models/1 {"accessories_amount":1}` -> 200 (was 18500); `PUT /api/admin/offers/1 {"amount":77777}` -> 200 (cash offer shown in on-road price). Both are in the audit log under content@. Restrict those fields to prices.write/admin. |
| R3-03 | Major | Frontend | Home weight 2.69 MB transferred (2.66 MB images, 25 requests; five 225-245 KB scene JPGs plus ~200 KB car heroes), above the ~1.5 MB bar. Slow-4G + 4x CPU: load 7.0 s, LCP 7.5 s. Use srcset/WebP at ~60-80 KB, preload only the hero. Other pages: /new-cars 643 KB, model page 189 KB, /used-cars 1.0 MB. |
| R3-04 | Major | Frontend | Home "story" section: `.story-vis` should be sticky but scrolls away (rect top -323 at scroll 500), leaving the left half blank for ~1,800 px on desktop; on mobile the steps are big empty gaps. Likely ancestor overflow or grid stretch; add `align-self:start`. |
| R3-05 | Major | Manager (assets) | Registration plates legible in used-car photos (blue SUV "MH14 TC ..." card on /used-cars; Kia card). Brief requires masked registration; IMAGE_CREDITS admits plates are not all blurred. Blur or replace. The text reg no. is masked correctly (UP32 •• ••34). |
| R3-06 | Minor | Backend | Password policy is length-only (10): `abcdefghijkl` and the user's own email are accepted; no common-password check. |
| R3-07 | Minor | Manager | README demo-login table lists 4 of 17 seeded users; missing principal@ (Principal@123), desk@ (Desk@123), manager.gomti/aliganj/alambagh@ (Manager@123), ravi@, sunita@, content@ (Content@123), service2@, wm.amausi@ (Workshop@123). Checklist still says "replace placeholder car art". No mention of OTP_MODE, /account, /compare, /exec. With NODE_ENV=production (Dockerfile) OTP is real but the only provider is a mock logger, so customers cannot sign in in production until messaging is wired; seeded demo passwords are not force-changed. run.bat itself is consistent. |
| R3-08 | Minor | Frontend | Anonymous /account logs a 401 console/network error (`GET /api/customer/me`). |
| R3-09 | Minor | Frontend | /staff/desk shows "Breached +35675:03" (unbounded mm:ss on old seed leads); show h/d. |
| R3-10 | Minor | Frontend | /admin/roles saves on a single checkbox click with no confirm or undo (one click granted admin.read to consultant). |
| R3-11 | Minor | Manager (assets) | Photos are real Tata/Kia/VW/Hyundai/Honda cars with visible badges for fictional "Brand X"; same image reused for different stock (three gold hatchbacks, two Honda City; 2022 Model C listed "Red" but photo is white); hero is CC BY-SA 4.0 with "contact before commercial use". Needs licence/brand sign-off. |
| R3-12 | Minor | Backend | `/api/staff/consultants` and the desk Assign list include admin, managers and used manager, so a lead can be assigned to the Administrator account. |
| D-12 | Minor | Frontend | (carried) hard-coded home stats. |
| N-02 | Minor | Manager | (carried) Docker build untested. |

## Verified OK
Customer: OTP request rate limit, customer cookie blocked from all staff APIs/pages and vice versa, cross-customer vehicle/booking edits denied, export is an attachment with own data only, CSRF blocked, logout kills session. Staff: principal UI fully read-only and every API write 403; consultant cannot read/patch/reply/reassign other showrooms' leads or import CSV; manager sees own showroom only; service_advisor limited to own workshop; AI band only admin/used_manager; exec only admin+principal; role edit removed a permission from a live session at once and is audited; deactivate/role change/revoke-all/logout kill live sessions; forced-change gate; login lock after 5 fails. Compare tray, saved-car sync, booking prefill, service-board move, desk assign, users screen and demo-accounts helper all worked in the browser.

---

# QA Report - Company A Motors (Round 2)

Tester: QA lead. Fresh seeded DB on port 3300 (RATE_LIMIT_PUBLIC=5000). No application code edited. Round 1 report follows below, unchanged.

## Round 2 score: 91 / 100 (round 1: 79)

| Area | Max | R1 | R2 | Why |
|---|---|---|---|---|
| Functionality vs brief | 30 | 25 | 28 | All flows still pass; stepper fixed. Deduction: AI summary reads "interested in not specified" when no model is chosen (N-01), home stats are still hard-coded (D-12). |
| Backend correctness / security | 20 | 17 | 19 | D-03, D-09, D-10 fixed and covered by new tests. Deduction: no DB-level reseed/--reset issue found, but `status=booked` used cars are listable and the booked detail page is 200 by design; kept as a note only. 1 point for unverified Docker build. |
| Frontend UX / design | 20 | 15 | 17 | Login feedback, stepper, tap-target CSS (44 px), AI box, silhouettes, sticky CTA fixed. Look matches DriveX reference (white/black, one red accent, ghost DRIVE watermark, skewed red tile, pill buttons). Deduction: car art is still generic placeholder silhouettes (Model H still slightly wagon-like) and the hero ghost text collides with the car card. |
| SEO / perf / a11y | 10 | 8 | 9 | JSON-LD now on /privacy and /opt-out. Tap targets verified from CSS and the FAST browser run only (full 390 px sweep not re-run). |
| i18n + DPDP | 10 | 9 | 9 | Unchanged, passing. Staff UI English only (documented). |
| Deployability / docs / tests | 10 | 5 | 9 | README exists, commands and logins verified (seed, start, npm test, e2e, admin login). Tests 27/27. Deduction: Dockerfile not built (no Docker here). |
| **Total** | **100** | 79 | **91** | |

## Suite results
- `npm test`: 27/27. `node tests/e2e/run.js`: 442/442 (D-03/D-07 now pass). Browser suite with FAST=1 (login wrong/right password, lead inbox, drawer, reply, admin price edit, stepper, admin pages): 89/89. The full ~20 min public sweep was not re-run; screenshots of home, new-cars, model page, test-drive (390) and staff drawer (390/1440) were read and judged.
- Re-seed on an existing DB is idempotent ("already seeded, use --reset"); counts unchanged. run.bat logic is sane (node check, seed on first run, start).

## Round 1 defect status
| ID | Status | Verification |
|---|---|---|
| D-01 | Fixed | staff.js skips redirect for /api/auth/login; browser suite wrong-password test passes. |
| D-02 | Fixed | 390 px step 1 shows only Continue (screenshot). |
| D-03 | Fixed | CRLF `_next` returns 201 with no 500/header injection; `//evil.com` becomes same-origin `/evil.com?ok=1`. |
| D-04 | Fixed (CSS) | 44 px min-height on nav, pills, buttons, swatches, hearts, dots, footer links. Runtime sweep not re-run. |
| D-05 | Fixed | AI box shows summary, next best action, Regenerate only. |
| D-06 | Fixed, minor residue | Model H is now a hatch shape; art still generic. |
| D-07 | Fixed | 1 JSON-LD block on /privacy and /opt-out. |
| D-08 | Fixed | README.md present and accurate. |
| D-09 | Fixed | `/api/used?status=sold` returns only available cars. |
| D-10 | Fixed | New test covers load balancing. |
| D-11 | Fixed | CTA no longer covers breakup rows at 1440 (screenshot). |
| D-12 | Still open (Minor) | Numbers rounded to 6,000+ / 900+ but still hard-coded in server/pages/public.js, not from admin settings. |

## Open defects (round 2): 0 Blocker, 0 Major, 3 Minor
| ID | Sev | Owner | Issue |
|---|---|---|---|
| D-12 | Minor | Frontend | Home stat figures hard-coded (6000/900), not admin-driven or removed. |
| N-01 | Minor | Backend | AI summary with unspecified interest reads "is interested in not specified." Should omit the clause. |
| N-02 | Minor | Manager | Dockerfile never build-tested by QA (no Docker on the QA machine); needs a real `docker build` + `/healthz` check before go-live. |

Also noted: 4 showrooms in seed vs "3 showrooms" in the brief wording of README/home (home count comes from DB, so it is consistent).

---

# QA Report - Company A Motors (Round 1)

Tester: QA lead. Environment: Node 22.17, Windows 11, fresh seeded temp DB on port 3200, headless Edge 156 (CDP) for browser checks. No application code was edited.

## Score: 79 / 100

| Area | Max | Score | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 25 | Every page and flow works. On-road math, masking, double-booking, bay capacity, auto-assign, SLA, CSV import, opt-out and AI gating are correct. Deductions: stepper nav buttons wrong on step 1, noisy AI box, silhouettes not matching body types. |
| Backend correctness / security | 20 | 17 | RBAC, CSRF, rate limit, lockout, SQLi, XSS storage, path traversal, upload CSP all hold. Deductions: CRLF in `_next` gives a 500 (after the lead is stored), sold stock listable via public API, specialty rule can starve a specialist. |
| Frontend UX / design / responsive | 20 | 15 | Strong DriveX-style look (white/black/one red accent, ghost "DRIVE" watermark, skewed red tiles, pill buttons). No horizontal scroll at 390px on any page, no console errors. Deductions: wrong-password login gives no feedback (Major), many sub-40px tap targets, floating CTA overlaps the price table on desktop. |
| SEO / performance / a11y | 10 | 8 | Unique title/description/canonical/hreflang/OG/JSON-LD; HTML 4-5 KB gz, CSS 6 KB gz, JS <4 KB gz, TTFB about 210 ms local. Deductions: /privacy and /opt-out have no JSON-LD, tap targets. |
| i18n + DPDP | 10 | 9 | Hindi really translates all 12 public pages (Devanagari content, title, on-road breakup helper); unchecked consent boxes, /privacy link, working opt-out that blocks messaging. Staff/admin UI is English only (documented). |
| Deployability / docs / tests | 10 | 5 | `npm test` 24/24, Dockerfile + /healthz + auto-seed. No README.md exists (contract promises seed logins and deploy docs there). |
| **Total** | **100** | **79** | |

## Defect count: 0 Blocker, 1 Major, 11 Minor (12 total)

## Defect table

| ID | Sev | Area | Owner | Repro | Expected vs actual |
|---|---|---|---|---|---|
| D-01 | Major | Staff login UX | Frontend | `/staff/login`, enter a valid email and a wrong password, submit. | Inline "Invalid email or password". Actual: `public/js/staff.js` `S.api` treats every 401 as "signed out" and does `location.href='/staff/login?next=...'`, so the page reloads, the form is wiped and no message is shown (the `.catch` in the login handler never runs). Fix: skip the redirect for `/api/auth/login`. |
| D-02 | Minor | Test-drive stepper | Frontend | `/test-drive` at 390px, step 1. | Only "Continue" visible on step 1. Actual: "Back" and "Confirm booking" are shown together with "Continue" on step 1 (screenshot `_test_drive_m.png`). |
| D-03 | Minor | Form fallback | Backend | `POST /api/leads` urlencoded with `_next=/contact%0d%0aSet-Cookie:%20x=1`. | Safe redirect or 400. Actual: 500 "Internal server error" from `router.redirect` (header injection rejected by Node), after the lead was already created (a duplicate-submit risk). Sanitise `_next` (strip CR/LF, require single leading `/`). |
| D-04 | Minor | Mobile tap targets | Frontend | 390px: `/` (13 controls), `/new-cars` (6), `/used-cars` (14) have links/buttons/inputs under 40 px. | Contract: 44 px touch targets. |
| D-05 | Minor | Staff drawer | Frontend | Open any lead. | Clean AI summary. Actual: the AI box prints raw keys: empty "Needs / Budget / Timeline" rows, a "Text" row duplicating the summary, "Source: heuristic", "Generated by: AI-generated...". |
| D-06 | Minor | Visual fidelity | Frontend | `/new-cars`, home hero. | Model H (hatchback) is drawn as a long station-wagon; looks like an estate, not a hatch. Silhouettes are generic. |
| D-07 | Minor | SEO | Frontend | `/privacy`, `/opt-out` page source. | Brief says every page has JSON-LD. Actual: none on these two (BreadcrumbList would suffice). |
| D-08 | Minor | Docs | Manager / Backend | Look for `README.md`. | Contract promises README with seed logins and deploy section. Actual: absent. |
| D-09 | Minor | Public API | Backend | `GET /api/used?status=sold`. | Sold cars should not be browsable. Actual: anonymous users can list sold stock (masking still correct). |
| D-10 | Minor | Lead assignment | Backend | Priya (no specialty) has 20+ open leads, Rahul (specialty S, V) 5; new Model C/H leads at Gomti Nagar always go to Priya. | Fewest-open should balance. Actual: a consultant with a non-empty specialty is excluded from every other model, so workload skews. Suggest tier 1 = specialists for that model, tier 2 = all at showroom ranked by open count. |
| D-11 | Minor | Desktop UI | Frontend | `/new-cars/model-h` at 1440x900. | Sticky CTA pill floats over the breakup rows (Insurance, Handling) so values are hidden until scrolled. |
| D-12 | Minor | Content | Frontend | Home stat strip "5,981+ cars delivered a year" counting up. | Numbers should come from admin/settings. Actual: marketing figures hard-coded in the page (not prices, but unverifiable claims). |

Not defects but noted: staff mobile header wraps (brand and tabs stack, acceptable); `/ui/onroad` and `/api/offers` are public by design; admin deleting a price rule leaves the city "no rule" and the site correctly shows the "price being updated" fallback.

## What passed (verified)

- `npm test`: 24/24 pass. E2E `node tests/e2e/run.js`: 439/442 (the 3 are D-03, D-07 x2). Browser `node tests/e2e/browser.js`: 249/254 (the 5 are D-04 x3, D-01, and 1 flaky status-filter timing assertion that I could not reproduce by API).
- All 16 public pages return 200; unique titles and descriptions; canonical, hreflang en/hi/x-default, OG tags, valid JSON-LD (Product/AggregateOffer on models, Vehicle/Offer on used, AutoDealer on home, BreadcrumbList). Models and used cars are indexable; /staff, /admin, /api, /forms, /ui disallowed in robots.txt; every sitemap URL returns 200. Custom 404 (no stack trace); malformed URLs and weird query strings do not 500.
- **On-road**: recomputed by hand for all 6 cities x all active variants from `/api/admin/price-rules` (road tax 8% / 10% above Rs 10 lakh, registration, insurance 3.1%, handling, FASTag, TCS 1% above Rs 10 lakh, minus cash offers with show_in_onroad). 0 mismatches. Example Model H LX Lucknow: 9,85,000 + 78,800 + 1,500 + 30,535 + 4,500 + 600 - 15,000 = Rs 10,85,935. NEW-H-02 = Rs 12,45,000 automatic petrol, TCS line present. Validity date and "may change" note (en+hi) present. Editing a price rule in the admin UI (browser, inline input) changed the public on-road price by exactly the edit and was restored; setting `valid_until` in the past gives `expired:true` and the page/helper show "Price being updated - request a quote"; a missing rule also falls back. Model-specific override row works.
- **Used cars**: UC-1182 (Model C VX Diesel 2022, 41,200 km, Rs 8,45,000, available) and UC-1190 (Model S LX Petrol 2021, 58,600 km, Rs 5,12,000, booked) correct. Full registration numbers (read from the admin API) appear in none of: public JSON, list and detail HTML (en and hi), sitemap, JSON-LD, consultant lead API. Masked as `UP32 •• ••34`; middle characters absent. Price-band suggestion: 401 anonymous, 403 consultant, 200 used_manager and admin; no AI fields in the public used JSON.
- **Leads**: consent required (missing, false, "false" all 422), phone validation and +91 normalisation, short name and bad email rejected; auto-assign by showroom (assignee belongs to the lead's showroom); due_at = created + 5 min; SLA chip shows countdown, breached state and filter; status change sets first_response_at; reassign and reply work; replies containing discount, percent or amount language are rejected (422) and unconfirmed replies are rejected; AI draft contains no discount language; ack message queued; opt-out marks leads, blocks replies and acks for that phone.
- **Test drive / service**: slots list; 409 once the demo cars for that model/showroom/slot are exhausted; 6 concurrent bookings cannot exceed demo cars; past dates and missing consent rejected; service bay capacity (6) enforced exactly (7th = 409, remaining = 0).
- **CSV import**: BOM, messy headers (Customer Name, Mobile No., E-mail ID, Car Model), quoted commas, escaped quotes, embedded newlines, +91 phone formats, dry-run creates nothing, duplicates and bad phones reported with row numbers, re-import yields 0 new, empty CSV 4xx, injection in source not 500. Browser import page: preview, error rows, real import all ran without JS errors.
- **Security**: anonymous blocked on all /staff and /admin APIs (401); consultant 403 on all admin APIs and HTML admin pages; service advisor cannot read leads; used_manager cannot edit price rules; text/plain and urlencoded cross-site POST without header rejected (403); session cookie HttpOnly + SameSite; forged cookie rejected; logout invalidates; login lockout after 5 failures (429) even for the correct password; public POST rate limit 20/min (429); no password hashes in any API; SQLi in login, onroad, used filters, import source: no 500, tables intact; stored XSS payloads (script/img in lead names, messages, CSV) are stripped or escaped and never executed in the staff inbox or import preview (checked in a real browser); reflected-XSS probes on 8 pages clean; open redirect via `_next` (https:// and //host) blocked; >5 MB body rejected; bad JSON 400; static path traversal, /data, /server not exposed; uploads served with sandbox CSP.
- **i18n**: `?lang=hi` sets the cookie, html lang, and 12 pages carry hundreds of Devanagari characters vs near none in English; no key English CTA strings left; Hindi titles; Hindi on-road breakup.
- **DPDP**: consent checkbox unchecked by default and /privacy link on every personal-data form; privacy notice covers rights, withdrawal, grievance contact.
- **Browser (Edge headless, desktop 1440 and mobile 390)**: zero JS exceptions, console errors, failed requests or broken images on all public pages, staff login, lead inbox (filters, search, drawer, reply, discount-reply rejection, status/notes save, reassign, AI regenerate), import, bookings, and every admin page (dashboard, models, prices incl. live calculator and inline edit, used stock + AI band, offers, banners, showrooms, users). No horizontal scroll anywhere at 390 px; one h1 per page; all form controls labelled.
- **Performance** (local): HTML gz 4-5 KB, app.css 6.2 KB gz, largest JS 3.9 KB gz, immutable caching on /css /js /img, security headers + CSP. Real 4G Lighthouse not run (no Lighthouse available); by size and TTFB the 2.5 s target is comfortably met.

## Not verified / limits

No real device testing, no Lighthouse score, no screen-reader pass, no formal contrast measurement (spot-checked visually only). Staff/admin UI Hindi is out of scope by design.

## Repeatable suites

- `BASE_URL=http://localhost:3200 RATE_LIMIT_PUBLIC=5000 node tests/e2e/run.js` (API/SEO/security; mutates data, use a throwaway DB; run with `RL_TEST=1` against a default-limit server to exercise the 429 check).
- `BASE_URL=... node tests/e2e/browser.js` (needs Edge/Chrome; `FAST=1` skips the public page sweep; takes about 20 minutes because of settle waits). Screenshots go to `%TEMP%\qa-shots`.
- Caution for rounds: the browser suite changes and restores one price rule; reseed between runs for determinism.
