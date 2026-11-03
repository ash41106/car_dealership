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
