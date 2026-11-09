# deployment.md – Company A Motors (Brand X dealership website)

**GitHub:** https://github.com/ash41106/car_dealership
**Live app:** not deployed (see "How it is deployed" – a Dockerfile and a step-by-step guide are provided; the app runs locally in one command).

Stack: Node.js >= 22.13, **no npm dependencies at runtime** (built-in `node:http` and `node:sqlite`), SQLite file database, server-rendered HTML + a little vanilla JS.

---

## 1. Run it locally (step by step)

**Requirements:** Node.js 22.13 or newer (`node -v`). Nothing else – there is no `npm install` step for running the app. Python is only needed for the optional UI skill, not for the site.

### Windows
1. Clone: `git clone https://github.com/ash41106/car_dealership.git` and `cd car_dealership`.
2. Double-click **`run.bat`** (or run it in a terminal).
   It checks for Node, seeds the demo database on the first run, starts the server and opens http://localhost:3000.

### macOS / Linux (or Windows without run.bat)
```
git clone https://github.com/ash41106/car_dealership.git
cd car_dealership
npm run seed        # optional – the server also seeds an empty database in non-production mode
npm start           # http://localhost:3000
```
Re-seed from scratch at any time: `npm run seed -- --reset`.

### Run the tests
```
npm test                    # 67 API/unit/integration tests (node:test, temp databases)
node tests/e2e/run.js       # HTTP-level end-to-end suite against BASE_URL (default http://localhost:3000), needs a fresh seeded DB
node tests/e2e/rbac.js      # role x endpoint authorisation matrix against a running server
```
Browser-driven suites (`tests/e2e/browser3*.js`) need Chrome or Edge installed.

---

## 2. Demo login details for the reviewer
These accounts exist only with demo data (non-production). Seed passwords are demo values – **not real credentials**.

**Staff** sign in at `http://localhost:3000/staff/login` (the page lists the demo accounts when not in production). All emails end in `@companya.in`.

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `admin@` | `Admin@123` | `/admin` (cars, prices, offers, banners, users, roles, audit) |
| Dealer Principal (read-only) | `principal@` | `Principal@123` | `/exec` dashboard |
| Lead desk | `desk@` | `Desk@123` | `/staff/desk` (SLA monitor, assign, CSV import) |
| Showroom managers | `manager.gomti@`, `manager.aliganj@`, `manager.alambagh@` | `Manager@123` | team inbox of their showroom |
| Sales consultants | `priya@`, `rahul@` (Gomti Nagar), `neha@`, `ravi@` (Aliganj), `amit@`, `sunita@` (Alambagh) | `Sales@123` | `/staff/leads` |
| Used-car manager | `used@` | `Used@123` | used stock + AI price band (only role besides admin that sees it) |
| Content editor | `content@` | `Content@123` | banners, offers, copy (cannot change prices) |
| Service advisors | `service@` (Amausi), `service2@` (Gomti Ext) | `Service@123` | `/staff/service` job cards + call-backs |
| Workshop manager | `wm.amausi@` | `Workshop@123` | workshop bays + all advisors' bookings |

**Customer (buyer / owner)** signs in at `/account` with a phone number and an OTP. In demo mode (`OTP_MODE=mock`, the default outside production) the OTP is shown on screen and **`123456`** works for any 10-digit number. The demo customer **`9876500001`** has a vehicle, past service bookings and saved cars.

**Suggested 5-minute tour**
1. `/new-cars/model-h` – change the city: the on-road price breakup (road tax, insurance, TCS, …), validity date and "prices may change" note come from the admin price table. Seed row: variant `NEW-H-02` Model H ZX automatic, Rs 12,45,000 ex-showroom.
2. `/used-cars` and `/used-cars/uc-1182-model-c-vx-2022` – filters, inspection report, masked registration number. (`UC-1190` shows as *Booked*.)
3. `/test-drive` – pick a showroom, a date and a real slot, submit with the consent box ticked. A named consultant is assigned instantly.
4. Sign in as `priya@companya.in` → `/staff/leads` → open the new lead: SLA timer, AI summary, editable draft reply (must tick "I have reviewed and edited this" before sending).
5. Sign in as `admin@companya.in` → `/admin/prices` → change a price rule and reload the public model page.
6. Sign in as `principal@companya.in` → `/exec` (read-only; every write API returns 403).

---

## 3. How it is deployed

**Status: not deployed to a public host.** The project is deployment-ready and was run locally and in headless browsers for QA; no live URL exists. Assumption: the deadline does not require a public deployment (the brief asks for "the link to the live app *if* you deployed it").

Ready-made options (all use the same artefacts in the repo):

### A. Docker (any container host: Render, Railway, Fly.io, a VM)
```
docker build -t companya-motors .
docker run -d -p 3000:3000 -v companya-data:/app/data \
  -e BASE_URL=https://your-domain -e TRUST_PROXY=1 -e SESSION_SECRET=<long-random> \
  -e BOOTSTRAP_ADMIN_EMAIL=owner@your-domain -e BOOTSTRAP_ADMIN_PASSWORD=<policy-compliant> \
  companya-motors
```
* The image is `node:22-alpine`, runs as the non-root `node` user, exposes 3000, has a `/healthz` health check, and keeps the SQLite database in the `/app/data` volume (**mount a persistent volume**).
* **Production never seeds demo users.** On the first start `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` create the schema, roles, showrooms, workshops, cities and one admin who must change the password at first login. Then remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment and enter models, variants, price rules, offers and used stock under `/admin`.
* The Dockerfile has been reviewed but **not built on the development machine** (no Docker installed there) – build and check `/healthz` before relying on it.

### B. Plain Node on a VM / Windows server
Install Node 22.13+, set the environment variables below, run `node server/server.js` under a process manager (pm2, NSSM, systemd) behind nginx or Caddy for HTTPS, and back up `data/app.db` (SQLite, WAL mode) daily.

### Demo deployment (to let reviewers click around)
To mirror the demo data on a host, run once with `NODE_ENV=development` (or without `NODE_ENV`), or `node server/seed.js --demo`, then start normally. Do not do this for a real production system.

---

## 4. Environment variables (names only – never commit values)

| Name | Purpose |
|---|---|
| `PORT`, `HOST` | listen port / interface (default 3000) |
| `NODE_ENV` | `production` turns on Secure cookies, disables demo seeding and the mock OTP |
| `BASE_URL` | public https URL – canonical links, sitemap, Secure cookies/HSTS |
| `DB_PATH` | SQLite file path (default `data/app.db`) |
| `SESSION_SECRET` | HMAC secret for session cookies (generated into `data/` if unset – set it explicitly in production) |
| `TRUST_PROXY` | `1` when behind a reverse proxy (uses `X-Forwarded-For`) |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | first admin on an empty production database |
| `AUTO_SEED` | `0` disables auto-seeding of an empty database (non-production) |
| `OTP_MODE` | `mock` (default outside production) shows the OTP / accepts `123456`; ignored in production |
| `MESSAGING_PROVIDER` | `mock` (log only, default) or `http` |
| `MESSAGING_URL`, `MESSAGING_TOKEN`, `MESSAGING_AUTH_HEADER`, `MESSAGING_AUTH_SCHEME`, `MESSAGING_TIMEOUT_MS` | generic HTTP gateway for WhatsApp/SMS and OTP |
| `SENDER_ID`, `DLT_ENTITY_ID`, `DLT_TEMPLATE_IDS` | India DLT sender / template registration for SMS |
| `ANTHROPIC_API_KEY` | optional – enables the Claude-backed lead summary and reply draft; without it deterministic heuristics are used |
| `RATE_LIMIT_PUBLIC`, `OTP_RATE_LIMIT` | per-IP / per-phone throttles (defaults 20 per minute / 3 per 10 minutes) |
| `LOG`, `MSG_LOG` | `0` silences request / message logs |
| `CHROME` | path to Chrome/Edge for the browser test suites only |

`.env.example` lists the same names with placeholder values. `.env`, the database (`data/`) and private originals are git-ignored.

---

## 5. Known limits you should know before reviewing
* WhatsApp/SMS sending is a **mock adapter** (messages are stored and logged, nothing is sent) unless an HTTP gateway is configured.
* Used-car and model photos are CC-licensed stock photos (credits at `/credits` and `docs/IMAGE_CREDITS.md`); they show other manufacturers' badges and stand in for fictional "Brand X".
* Rate limits and login lock-outs are in memory (reset on restart; per process).
* Price rules (road tax, insurance, TCS, fees) are **illustrative seed values** editable by the admin – they are not official rates.
* More detail and the full list of cuts are in the Technical Design Document.
