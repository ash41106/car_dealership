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
