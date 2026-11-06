# Company A Motors – Dealership Website

A production-style website for **Company A**, a Lucknow dealer of **Brand X** (3 showrooms, 2 workshops, certified used-car yard).
Buyers browse new and used cars, see a city-wise on-road price breakup and EMI, and book a test drive in a real slot or a service in a free bay. Every enquiry is auto-assigned to a named consultant with a 5-minute response timer. Admin runs everything from a CMS.

- Server-rendered HTML (fast on 4G, every model and used car has its own indexable URL), English + Hindi
- Zero npm dependencies: Node.js >= 22.13, built-in `node:sqlite`
- Mock WhatsApp/SMS messaging, AI helpers that work offline (optional Claude via `ANTHROPIC_API_KEY`)

## Quick start (Windows)

Double-click **`run.bat`** (or run it in a terminal). It seeds the database on first run, starts the server and opens http://localhost:3000.

Any OS:
```
npm run seed      # optional: server auto-seeds an empty DB
npm start         # http://localhost:3000
npm test          # API tests (node:test)
node tests/e2e/run.js   # HTTP-level QA suite against BASE_URL (default http://localhost:3000)
```

## Demo logins (seed data – change before go-live)
All staff emails end in `@companya.in`.
| Role | Login | Password | Lands on |
|---|---|---|---|
| Admin | admin@ | Admin@123 | `/admin` (everything, incl. users, roles, audit) |
| Dealer Principal (read-only) | principal@ | Principal@123 | `/exec` dashboard |
| Lead desk | desk@ | Desk@123 | `/staff/desk` (SLA monitor, assign, CSV import) |
| Showroom managers | manager.gomti@ / manager.aliganj@ / manager.alambagh@ | Manager@123 | team inbox for their showroom |
| Sales consultants | priya@ / rahul@ (Gomti Nagar), neha@ / ravi@ (Aliganj), amit@ / sunita@ (Alambagh) | Sales@123 | `/staff/leads` |
| Used-car manager | used@ | Used@123 | used stock + AI price band |
| Content editor | content@ | Content@123 | banners, offers, copy (no prices) |
| Service advisors | service@ (Amausi), service2@ (Gomti Ext) | Service@123 | `/staff/service` job cards + call-backs |
| Workshop manager | wm.amausi@ | Workshop@123 | workshop bays + all advisors' bookings |
| **Customer** (buyer/owner) | phone `9876500001` | OTP `123456` | `/account` |

Staff sign in at `/staff/login` (a demo-accounts list is shown outside production). Customers sign in at `/account` with phone + OTP: in demo mode (`OTP_MODE=mock`, the default outside production) any number works with OTP `123456`. In production OTPs go through the SMS/WhatsApp provider you configure (see below) and `dev_otp` is never returned.

### Access control
Permission-based RBAC: roles map to permissions (editable by admin at `/admin/roles`), every API route declares its permission, data is scoped (consultant = own/showroom leads, service advisor = own workshop, lead desk = all showrooms, Dealer Principal = read-only). Server-side sessions are revocable (logout, password change, role change, deactivation). New passwords need 10+ characters. The `tests/api/rbac_matrix.test.js` suite checks every role against every endpoint.

## What's inside
| Area | Pages |
|---|---|
| Buyers | `/`, `/new-cars`, `/new-cars/:slug` (variants, colours, on-road price by city, EMI), `/used-cars` (filters), `/used-cars/:slug` (inspection report, masked reg no.), `/test-drive`, `/service`, `/emi`, `/trade-in`, `/contact`, `/privacy`, `/opt-out` |
| Customer | `/account` (OTP sign-in; bookings, vehicles, saved cars, enquiries, privacy: export/delete/withdraw consent), `/compare`, `/credits` |
| Staff | `/staff/leads` (inbox, SLA timers, AI summary + draft reply, reassign), `/staff/desk` (lead desk SLA monitor + assign), `/staff/service` (job-card board + call-back queue), `/staff/import` (portal CSV, lead desk/admin), `/staff/bookings`, `/exec` (read-only Dealer Principal dashboard) |
| Admin | `/admin` dashboard, models/variants, **prices** (city × model price rules + live calculator), used stock (AI price band for used manager/admin only), offers, banners, showrooms, workshops, cities, demo cars, users |
| Platform | `/sitemap.xml`, `/robots.txt`, `/healthz`, daily DMS CSV export `/api/admin/export/dms.csv` |

### Key rules implemented
- **On-road price** comes only from the admin price-rule tables (road tax, registration, insurance, handling, FASTag, TCS, accessories, offers), always with a breakup, validity date and "prices may change" note. Expired/missing rules show "price being updated – request a quote".
- **Lead handling**: auto-assign by showroom + model (least-loaded consultant), `due_at` = created + 5 min, status flow, acknowledgement template by WhatsApp/SMS (mock), consultants can reassign.
- **AI**: buyer summary, first-reply draft (never quotes discounts; must be reviewed and confirmed before sending), used-car price band from past sales visible only to the used-car manager/admin. The used-car manager sets the final price.
- **DPDP Act 2023**: unchecked consent box on every form, consent log, `/privacy`, `/opt-out`; opted-out numbers receive no messages.
- **Used cars** show year, owners, km; the registration number is masked everywhere.
- Out of scope (as per brief): online payments, DMS integration (CSV export instead), spare-parts e-commerce.

## Configuration (environment variables)
`PORT` (3000), `HOST`, `DB_PATH` (data/app.db), `SESSION_SECRET`, `BASE_URL` (set to your https URL in production – enables Secure cookies/HSTS and correct sitemap/canonicals), `TRUST_PROXY=1` behind a reverse proxy, `ANTHROPIC_API_KEY` (optional), `AUTO_SEED=0`, `LOG=0`, `RATE_LIMIT_PUBLIC`.
Copy nothing secret into git; `data/` and `.env` are git-ignored.

## Deploy
**Docker**
```
docker build -t companya-motors .
docker run -d -p 3000:3000 -v companya-data:/app/data -e BASE_URL=https://www.example.in -e TRUST_PROXY=1 -e SESSION_SECRET=<long-random> companya-motors
```
**Render / Railway / Fly**: use the Dockerfile, mount a persistent volume at `/app/data`, set the env vars above.
**Windows / VM**: install Node 22.13+, run `run.bat` (or `node server/server.js` under NSSM/pm2), put nginx or Caddy in front for HTTPS, and back up `data/app.db` (SQLite, WAL mode) daily.

### Production first start (no demo accounts)
With `NODE_ENV=production` the app never seeds demo users or passwords. Before the first start set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (10+ characters, 3 of 4 character classes, no common words, name or email), or run `node server/seed.js --bootstrap` once (it prints a generated one-time password if none is given). This creates the schema, roles, showrooms, workshops, cities and **one admin who must change the password at first login** – no demo leads, customers or catalog. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment afterwards, sign in at `/staff/login`, then enter models, variants, price rules, offers and used stock under `/admin`. Without an admin or the bootstrap variables the server exits with an explanatory message.
Docker: `docker run --rm -v companya-data:/app/data -e BOOTSTRAP_ADMIN_EMAIL=you@example.in <image> node server/seed.js --bootstrap` once, then start normally.
Demo data and the logins above are for development only (`npm run seed`, or `npm run seed -- --demo`).

### Before go-live checklist
1. Change all seed passwords and set `SESSION_SECRET`.
2. Verify the price rules (road tax %, insurance, TCS) with the Transport Dept / insurer – seed values are indicative.
3. Replace the stand-in photos (Wikimedia Commons, see `/credits` and `docs/IMAGE_CREDITS.md`; they show other manufacturers' badges) with the brand's official press images and the yard's own used-car photos via the admin image upload. Number plates must be masked on every used-car photo.
4. Connect a real WhatsApp Business / SMS provider (DLT-approved templates) in `server/services/messaging.js` (env-configured HTTP provider). Customer OTP login cannot work in production until this is set.
5. Have the privacy notice and Hindi copy reviewed by legal/native speakers.
6. Set up HTTPS, backups and monitoring on `/healthz`.

## Repo layout
```
server/  server.js, lib/ (router, db, auth, csv), services/ (business logic), api/, seed.js,
         pages/ + views/ (server-rendered pages, i18n, car image generator)
public/  css/ js/ (small vanilla JS)
tests/   api/ (node:test), e2e/ (HTTP + headless browser QA)
docs/    CONTRACT.md, RESEARCH.md, BACKEND_NOTES.md, FRONTEND_NOTES.md, QA_REPORT.md
```
See `PROGRESS.md` for the build log.
