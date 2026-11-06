# Backend notes (Backend dev)

## Run
- `npm start` (node server/server.js) - auto-migrates and auto-seeds an empty DB (disable with AUTO_SEED=0). `npm run seed` (idempotent; `-- --reset` wipes DB first). `npm test`.
- Tests: `node --test "tests/api/*.test.js"` (Node 22 does not accept a bare directory arg `node --test tests/api`).
- Env: PORT, HOST, DB_PATH, SESSION_SECRET (else generated into data/.session_secret), BASE_URL (https => Secure cookies + HSTS), TRUST_PROXY=1 (use X-Forwarded-For), ANTHROPIC_API_KEY (optional; model claude-sonnet-5-5), LOG=0 (silence request log), MSG_LOG=0, RATE_LIMIT_PUBLIC (default 20/min/IP), MESSAGING_PROVIDER (mock only).

## API quirks
- Public POSTs return 201 JSON. Form posts (urlencoded) with `_next=/path` get a 303 redirect to `_next?ok=1` or `?err=<message>`.
- `GET /api/me` returns 401 when not logged in. Authenticated non-GET calls need `Content-Type: application/json` or `X-Requested-With: fetch` (else 403 CSRF).
- Validation errors: 422 `{error, errors:{field:msg}}`; slot/bay conflicts: 409; rate limit/login lock: 429.
- Lead replies: `POST /api/staff/leads/:id/reply {text, channel, confirmed_edit:true}`; text with discount/offer/%/amount language is rejected 422.
- On-road rule: city+model row in price_rules, else city-wide row; formula documented above `getOnRoadPrice` in services/catalog.js. `no_rule:true, expired:true` when a city has no rule.
- Extra endpoints: `/api/offers`, `/api/banners`, `/api/admin/dashboard`, `/api/admin/settings` (EMI defaults, slot lists), `services/catalog.emiDefaults()`, `services/sales.listYard()`.
- Services: AI has sync heuristics (`summarizeLead`, `draftReply`, `suggestUsedPrice`) plus `*Async` Claude-backed variants (used by POST /leads/:id/ai).
- Static: /uploads served with sandbox CSP; /img/car/:model.svg?c=hex fallback SVG generator in server.js (frontend routes registered earlier win).
- Seeds 7 logins (contract list), 15 used cars (UC-1203 is sold), 32 past sales, 60 historic leads.

## Auth & RBAC v2 (migration 2; existing DBs are upgraded in place on start)
- Sessions are server-side (`sessions` table, only SHA-256 of the opaque cookie id is stored). Staff cookie `sid` (idle 30 min, absolute 12 h); customer cookie `cs` (idle 30 days, absolute 90 days). Logout, `POST /api/auth/revoke-all`, password change, admin password reset, admin deactivate / role change all revoke sessions. Login throttle (5 fails/ip+email = 15 min lock). Logins, failed logins, lockouts, password changes, role/user/price edits are in the audit log.
- Passwords: scrypt, min 10 chars for new passwords (seed demo passwords predate the policy). `must_change_password` blocks every API except /api/me, change-password, revoke-all (403 with `errors.code=password_change_required`).
- Permissions live in `roles` / `role_permissions` (seeded from `server/lib/perms.js` MATRIX only for roles that do not exist yet; admin edits persist; admin always has every permission). Every route declares `handler.perm` ('public' | 'authenticated' | perm | [any-of]); `guard(perm, fn)` does 401 -> 403 -> CSRF. `perms.can(user, perm)` for service-level checks. Data scoping is permission-driven (lead.read.own/showroom/all/used, booking.read.showroom/workshop/all).
- Roles: customer, consultant, lead_desk, showroom_manager, service_advisor, workshop_manager, used_manager, content_editor, dealer_principal (read-only), admin.
- Customer OTP: `OTP_MODE=mock` (default unless NODE_ENV=production) returns `dev_otp` and accepts 123456 for any number. `OTP_MODE=real` sends via messaging adapter (mock provider logs). 6 digits, HMAC-hashed, 5 min, 5 attempts, 3 requests / 10 min / phone (OTP_RATE_LIMIT).
- Revenue at risk (GET /api/exec/summary): late_leads x conversion_gap x 25,000 + unanswered_callbacks x 0.5 x 4,500 x 0.30; gap = measured (won rate in-SLA minus late) else default 0.10. Constants are settings keys exec_contribution_lead / exec_contribution_callback / exec_default_conversion_gap.
- Frontend note: page gating still lists the old 4 roles; new roles should use `/api/me` `permissions`.

## Hardening round (R3)
- R3-02: price-bearing fields need `prices.write` (admin only): models.accessories_amount, offers amount/type/show_in_onroad (creating a cash offer too), variants, price-rules. Unchanged values are accepted so editors can round-trip a form. Used price needs used.write (used_manager/admin). Admin entities have PUT only (no PATCH).
- R3-06 password policy (change-password, admin create/update, temp passwords): >=10 chars, >=3 of lower/upper/digit/symbol, no email local-part or name token (>=3 chars), no common word (password, welcome, qwerty, companya, ...), must differ from current.
- R3-12: new permission `lead.work` (consultant, showroom_manager; backfilled once into existing DBs; admin intentionally excluded). Reassign target must hold it (else 422); GET /api/staff/consultants lists only such users (own showroom unless lead.read.all). Auto-assign falls back to the showroom manager if no consultant exists.
- OTP in production is fail-closed: NODE_ENV=production ignores OTP_MODE=mock; with MESSAGING_PROVIDER=mock request returns 503 (no dev_otp, 123456 rejected); gateway failure returns 502 and the OTP is voided. HTTP gateway adapter in services/messaging.js is configured only by env (see `.env.example` and the comment above `httpProvider`): MESSAGING_URL/TOKEN/AUTH_HEADER/AUTH_SCHEME/HEADERS, SENDER_ID, DLT_ENTITY_ID, DLT_TEMPLATE_IDS, MESSAGING_BODY_TEMPLATE with {{to}} {{to10}} {{message}} {{sender}} {{template}} {{template_id}} {{entity_id}} {{channel}} {{lang}} {{otp}}.
- Settings: `site_stats` ({new_cars_per_year:6000, used_cars_per_year:900}) and `contact` are JSON-object settings editable via PUT /api/admin/settings (settings.write, audited) and exposed anonymously (Cache-Control public 300 s + ETag) at GET /api/settings/public together with EMI defaults.
- R3-11: seed colours/models now match photos (UC-1182..1203, six new cars UC-1192/1194/1196/1198/1200/1202 added on fresh seeds). `seed.fixups()` (run at every start and by `npm run seed`) idempotently corrects colour, model, slug and photo hex of existing rows; it does not insert missing cars into old databases.

## Round 4
- R4-02: NODE_ENV=production never auto-seeds demo data. `node server/seed.js --bootstrap` (or BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD at boot) creates schema, roles, settings, showrooms, workshops, cities and ONE admin with must_change_password=1 (no demo users/leads/customers/catalog; policy enforced; without a password one is generated and printed once). Production boot with no admin and no bootstrap env exits 1 with a clear message. Demo seed: non-production default, or `npm run seed -- --demo`; `seed.fixups()` is skipped in production.
- R4-03: any change to active/model_id/valid_until/amount/type/show_in_onroad of a cash offer (and creating/deleting one), model active/accessories_amount and deleting a model need prices.write. Info offers: copy and active are free.
- Used photos: `photoFor()` returns /img/used/<stock>.jpg or a same-body-type photo; API never returns .svg URLs (filtered even for stale rows); fix-up rewrites stale rows; admin-created cars get a default real photo.
- Hindi used-car data: migration 3 adds `used_cars.location_hi`; inspection items carry `note`, `note_en`, `note_hi`; `/api/used`, `/api/used/:id` and the admin used editor expose `location_hi` (falls back to `location`); `seed.fixups()` backfills existing rows. Photo note: all 15 files in public/img/used are owned by one car each, so UC-1188 (Model S) reuses `uc-1203.jpg` (the SOLD UC-1203, which is not shown in public lists, so no visible twin). Other cars without own files (UC-1171/1175/1179/1184/1186) still share same-body-type photos with a listed twin.
