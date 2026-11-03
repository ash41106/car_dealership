# Frontend notes
- Built: all public pages (SSR), staff (login, leads inbox + drawer, import, bookings), admin (dashboard, models/variants, prices + calculator, used + AI band, offers, banners, showrooms/workshops/cities/demo-cars, users).
- Procedural car SVG at /img/car/:slug.svg?c=hex&t=bodytype (server/views/carimg.js). Backend also registers a fallback route after pages; pages route wins.
- Helper routes: GET /ui/onroad (JSON {html,total,raw}) for live price breakup; POST /forms/* plain-POST fallbacks.
- Staff/admin UI is English only (public site is EN/HI via server/views/i18n.js).
- Design follows DriveX-style direction from manager (black pills, one red accent, skewed tiles, ghost watermark).
