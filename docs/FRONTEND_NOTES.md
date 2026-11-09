# Frontend notes
- Built: all public pages (SSR), staff (login, leads inbox + drawer, import, bookings), admin (dashboard, models/variants, prices + calculator, used + AI band, offers, banners, showrooms/workshops/cities/demo-cars, users).
- Procedural car SVG at /img/car/:slug.svg?c=hex&t=bodytype (server/views/carimg.js). Backend also registers a fallback route after pages; pages route wins.
- Helper routes: GET /ui/onroad (JSON {html,total,raw}) for live price breakup; POST /forms/* plain-POST fallbacks.
- Staff/admin UI is English only (public site is EN/HI via server/views/i18n.js).
- Design follows DriveX-style direction from manager (black pills, one red accent, skewed tiles, ghost watermark).

## Visual layer v2 + RBAC UI (this round)
- Media: server/views/media.js resolves photos (img/cars/<slug>-<kind>.jpg, img/used/<stock>.jpg, img/scenes/*) with the procedural SVG as fallback. Photos use object-fit:cover in fixed aspect boxes. Used-car photos have no zoom lightbox (data-nolb).
- New CSS/JS: public/css/fx.css, public/js/fx.js (cursor, magnetic, tilt, story, compare tray, lightbox, drag strip, filters drawer). /compare, /credits (from img/credits.json, linked in footer), /account (OTP sign-in, bookings, vehicles, saved, enquiries, profile/privacy incl. export/delete/withdraw).
- Account UI strings live in public/js/account.js (EN/HI dict) rather than i18n.js.
- Staff shell is a role-aware sidebar. Gating uses permissions (lib/auth.whoami -> permissions; falls back to lib/perms). New pages: /staff/desk, /staff/service, /exec, /admin/roles, /admin/audit, rebuilt /admin/users. Forced password change screen when must_change_password.
- Demo accounts helper on /staff/login, hidden when NODE_ENV=production.
- Note for tester: consultants no longer have lead.import, so /staff/import is 403 for them by design.

## Round 3 fixes
- Images: run `node server/views/gen-variants.js http://localhost:<port>` (needs a running server + Chrome/Edge) after any photo change; it rebuilds public/img/v/** (WebP+JPEG 400-1280w) and og-default.jpg (from CC0 cars/model-s-hero.jpg). layout.img() emits <picture>/srcset automatically for /img/{cars,used,scenes}/*.jpg; home preloads only the first hero slide; scene backgrounds load via IntersectionObserver (data-bg); non-active hero slides stay display:none until idle.
- Removed scenes/hero-road.jpg and the old og-default (licence); no code references them.
- Home stats come from the backend site_stats setting (fallback constants in server/pages/public.js DEFAULT_STATS).
- Colour swatches only swap the picture for SVG renders or genuine per-colour photos; photographic models show "available colours" chips.

## Design system v2 (night showroom) and how to add motion
**Files**: `public/css/v2.css` (tokens, fonts, type, split headline, view transitions, cards, bottom-sheet filters), `home2.css`, `detail2.css`, `book2.css` (per-page layers loaded through `page({css:[...]})`), `public/js/v2.js` (word-split + load sequence), `fx.js` (cursor labels, magnetic, tilt, lightbox, filters sheet, dialog openers), `home2.js`, `car.js`, `book.js`. Fonts live in `public/fonts` (see docs/FONT_LICENSES.md); Noto Sans Devanagari is declared inline only on `lang=hi`.
**Tokens** (`:root` in v2.css): `--paper/--ink` surfaces, `.night` or `[data-tone=night]` flips `--bg/--fg/--surface/--rule/--accent`; ONE accent `--crimson` (`--crimson-hi` on night). Motion: `--dur-1..5` (120/240/480/800/1200ms), `--ease-out`, `--ease-inout`, `--ease-snap` (overshoot, used for the price landing), `--spring-ui` (linear() spring).
**Adding motion** (rules): 1) prefer CSS (transitions, `animation-timeline`, `@view-transition`, `clip-path`); 2) JS only for what CSS cannot do; animate `transform/opacity/clip-path` only; 3) every animation needs a no-JS / reduced-motion equivalent: gate on `A.RM` (JS) or `@media (prefers-reduced-motion: reduce)` (CSS); 4) kinetic headline: add `data-split` to a heading (words, never letters, so Devanagari conjuncts survive); 5) reveal: `.reveal` (IntersectionObserver in app.js) or `.rise` with `style="--d:<ms>"` for the load sequence; 6) magnetic: `data-mag` on a button; cursor label: `data-cursor="VIEW"`; 7) shared-element morph between pages: the clicked card image gets `view-transition-name:car` on `pageswap`, `.stage` on `pagereveal` (inline script in layout.js); same-document morph: `document.startViewTransition` (booking ticket); 8) Motion library: `public/js/vendor/motion-mini.js` (5KB gz) is lazy-loaded only where used (matcher results); `motion-dom.js` (61KB gz) is vendored but intentionally NOT loaded anywhere to stay inside the JS budget.
**Perf budget (measured)**: see the milestone report; home JS about 15KB gz, CSS about 19KB gz.
