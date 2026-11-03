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
