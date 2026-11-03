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
| Role | Login | Password |
|---|---|---|
| Admin | admin@companya.in | Admin@123 |
| Used-car manager | used@companya.in | Used@123 |
| Sales consultants | priya@ / rahul@ / neha@ / amit@companya.in | Sales@123 |
| Service advisor | service@companya.in | Service@123 |

Staff sign in at `/staff/login`; the admin console is at `/admin`.

## What's inside
| Area | Pages |
|---|---|
| Buyers | `/`, `/new-cars`, `/new-cars/:slug` (variants, colours, on-road price by city, EMI), `/used-cars` (filters), `/used-cars/:slug` (inspection report, masked reg no.), `/test-drive`, `/service`, `/emi`, `/trade-in`, `/contact`, `/privacy`, `/opt-out` |
| Staff | `/staff/leads` (inbox, SLA timers, AI summary + draft reply, reassign), `/staff/import` (portal CSV), `/staff/bookings` |
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

### Before go-live checklist
1. Change all seed passwords and set `SESSION_SECRET`.
2. Verify the price rules (road tax %, insurance, TCS) with the Transport Dept / insurer – seed values are indicative.
3. Replace placeholder car art with real photography via the admin image upload.
4. Connect a real WhatsApp Business / SMS provider (DLT-approved templates) in `server/services/messaging.js`.
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
