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
