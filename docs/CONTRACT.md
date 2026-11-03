# Engineering Contract (Manager-owned; all agents follow it)

Product: **Company A Motors** (Lucknow) – authorised dealer of **Brand X**. Real-life dealership site: buyers browse new/used cars, see on-road price breakup + EMI, book test drives and services; staff work a lead inbox with a 5-minute SLA; admin runs the CMS.

## Stack (no npm dependencies – must run with `node server/server.js` on Node >= 22.13)
- Backend: plain `node:http`, `node:sqlite` (DatabaseSync), `node:crypto` (scrypt password hashing, HMAC-signed session cookie), `node:zlib` gzip. DB file: `data/app.db` (env `DB_PATH`). Port: env `PORT` (default 3000). `SESSION_SECRET` env (generate+persist to data/ if missing). Env `BASE_URL` for canonical/sitemap.
- Frontend: server-side rendered HTML (template strings, no framework) for every public page (SEO + <2.5 s on 4G), small vanilla JS (progressive enhancement) in `public/js`, one CSS file in `public/css`. No external fonts/CDNs (system font stack incl. Noto Sans Devanagari fallback). Images: lazy-loaded, width/height set, SVG/inline where possible.
- Language: English + Hindi. `?lang=hi|en` sets cookie `lang`; default en. All DB content has `_en`/`_hi` columns; UI strings in `server/views/i18n.js`.

## Ownership (do not edit files you do not own; request via the manager)
| Owner | Paths |
|---|---|
| Backend dev | `server/server.js`, `server/lib/**`, `server/services/**`, `server/api/**`, `server/seed.js`, `tests/api/**`, `Dockerfile`, `package.json` |
| Frontend dev | `server/pages/**`, `server/views/**`, `public/**` |
| Tester | `tests/e2e/**`, `docs/QA_REPORT.md` |
| Manager | `docs/**` (except QA_REPORT), README.md, PROGRESS.md, run.bat |
| Researcher | `docs/RESEARCH.md` |

## Wiring
`server/server.js` creates the router (`server/lib/router.js`), registers `/api/*` from `server/api/index.js`, then if it exists `require('./pages').register(router)` (frontend file `server/pages/index.js`), then static `public/` (with long cache for `/css /js /img`, gzip, ETag), 404 fallback calling `router.notFound` (frontend may set it).

Router API (backend implements): `router.get|post|put|patch|delete(pattern, handler)`; pattern supports `:param`. Handler gets `ctx`:
```
ctx = { req, res, params, query, body /*parsed JSON, urlencoded or {} */, user /*session user or null*/, lang /* 'en'|'hi' */,
        json(obj,status=200), html(str,status=200), text(str,status,contentType), redirect(url,status=302),
        setCookie(name,val,opts), setHeader(k,v) }
```
Handlers may be async. Throw `{status, message, errors}` (use `lib/util.js` `httpError(status,msg,errors)`) → API returns `{error:message, errors}`. Body limit 5 MB (CSV import, image upload as base64 data URL stored under `data/uploads`, served at `/uploads/...`).
CSRF: session cookie `SameSite=Lax; HttpOnly`; state-changing /api calls require JSON content-type or header `X-Requested-With: fetch` for authenticated routes.

## Roles
`admin`, `used_manager`, `consultant`, `service_advisor`; buyers are anonymous (no account). Permission summary:
- consultant: lead inbox (own showroom's leads + assigned to them), update status/notes, reassign, send replies. NO price admin, NO used-price suggestion.
- used_manager: used stock CRUD, set final prices, **only role (plus admin) that sees AI price-band suggestion**.
- service_advisor: service bookings list/update.
- admin: everything incl. models, variants, price rules, offers, banners, showrooms, demo cars, users, CSV import, DMS export.

Seed logins (documented in README): `admin@companya.in / Admin@123`, `used@companya.in / Used@123`, consultants `priya@companya.in`, `rahul@companya.in`, `neha@companya.in`, `amit@companya.in` all `Sales@123`, `service@companya.in / Service@123`.

## Domain / seed
- 3 showrooms (Gomti Nagar, Aliganj, Alambagh–Kanpur Road), 2 workshops (Amausi, Gomti Nagar Extension) with bays (e.g. 6 and 4), a used-car yard (Faizabad Road).
- Brand X models (fictional): **Model H** (hatchback), **Model C** (sedan), **Model S** (SUV), **Model V** (7-seat MPV), each 2–4 variants (petrol/diesel/CNG/auto). Seed exactly: variant `NEW-H-02` Model H ZX automatic Petrol ex-showroom ₹12,45,000; used `UC-1182` Model C VX Diesel 2022 41,200 km ₹8,45,000 Available; `UC-1190` Model S LX Petrol 2021 58,600 km ₹5,12,000 Booked. Plus ~12 more used cars and ~30 past sales (for price suggestion) and ~60 historic leads for realism.
- Cities for pricing: Lucknow, Kanpur, Varanasi, Prayagraj, Gorakhpur, Delhi NCR (admin-editable `cities`).
- On-road price = from admin **price_rules** table (per city; optional per model override). Components (each line has `label_en`, `label_hi`, `amount`): ex-showroom; road tax (% of ex-showroom, with higher % above a threshold price band); registration & smart-card fee; insurance (% of ex-showroom); handling/logistics; FASTag; TCS (1% if ex-showroom > ₹10 lakh, configurable); optional accessories package (toggle, amount from admin per model); **less** active offer/corporate benefit (only if admin-defined offer is cash-type and `show_in_onroad=1`). Result includes `valid_until` (admin date) and note text: "Prices are indicative and may change without notice. Final on-road price is confirmed in the quotation." (en+hi). If `valid_until` is past, flag `expired:true` and UI shows "Price being updated – request a quote". **Prices must never be hard-coded anywhere except the admin tables.**
- Used cars: year, owners, km, fuel, transmission, 100-point inspection (JSON: sections with pass/attention items + score), photos, price, status (available/booked/sold), **registration number stored in full but exposed masked** (`UP32 •• ••34` → only state+RTO code and last 2 digits visible) in every public API/page. Stock id used in URL: `/used-cars/uc-1182-model-c-vx-2022`.
- Leads: auto-assign by showroom + model: eligible consultants = active consultants at that showroom (with model specialty if set) → pick fewest open leads (round-robin tie-break). If no showroom given, choose by city/nearest default showroom. `due_at = created_at + 5 min`; `first_response_at` set when status leaves `new` or a reply is sent; `breached` when past due. Statuses: `new, contacted, test_drive, negotiation, won, lost`. Sources: `website, test_drive, trade_in, finance, carwale/cardekho-style portal, facebook/instagram ads, walk_in`. On creation an acknowledgement WhatsApp/SMS **template** is queued in `messages` (mock provider adapter `services/messaging.js`; log only; honour opt-out). Consent: lead creation requires `consent:true` (store consent text, timestamp, IP hash, lang in `consents`). `POST /api/opt-out {phone}` marks all leads of that phone opted-out and blocks future messages.
- AI (`services/ai.js`): works fully offline with deterministic heuristics; if `ANTHROPIC_API_KEY` set, may call Claude (model `claude-sonnet-5-5`) via `fetch` with fallback to heuristics on error/timeout. Outputs: `summarizeLead(lead)` (needs, budget, timeline, model interest, next best action), `draftReply(lead, lang)` (never quotes discounts/offers/% off/on-road amounts: post-filter strips them; reply must be edited/confirmed by consultant before send; send endpoint requires `confirmed_edit:true` and rejects text containing discount language unless consultant ticks override – keep simple: reject), `suggestUsedPrice(usedCar)` from `past_sales` of same model, year ±1, km band → `{low, mid, high, comps:n, basis}`. Suggestion is stored/returned only to used_manager/admin. UI shows "AI-generated – review before use".
- DMS: no integration; `GET /api/admin/export/dms.csv?date=YYYY-MM-DD` daily CSV (won leads, bookings, used status).

## Service function signatures (backend implements in `server/services/*.js`, frontend SSR pages call them directly; all sync unless noted; they return plain JSON-able objects; `lang` only chooses nothing – both languages are returned as `_en/_hi`)
```
catalog.js
  listModels()                       -> [{id,slug,name,tagline_en,tagline_hi,body_type,fuel_types:[...],from_price,hero_image,colors:[{name_en,name_hi,hex}],featured}]
  getModel(slug)                     -> {...model, description_en,description_hi, gallery:[{url,alt_en,alt_hi}], specs:[{group_en,group_hi,label_en,label_hi,value}], highlights:[{title_en,title_hi,body_en,body_hi}], variants:[{id,code,name,fuel,transmission,ex_showroom,features_en:[],features_hi:[]}], offers:[offer] } | null
  listCities()                       -> [{id,slug,name_en,name_hi}]
  getOnRoadPrice(variantId, citySlug, {accessories:bool}) -> {variant:{id,name,model_name}, city, lines:[{key,label_en,label_hi,amount,kind:'add'|'less'|'total'}], ex_showroom, on_road, valid_until, expired, note_en, note_hi}
  listOffers({active:true})          -> [{id,title_en,title_hi,body_en,body_hi,model_id|null,valid_until,banner_image}]
  listBanners()                      -> [{id,title_en,title_hi,sub_en,sub_hi,image,cta_label_en,cta_label_hi,cta_url}]
  emi({principal, rate, months, downPayment}) -> {loan, emi, total_payable, interest}   // pure fn, rate = annual % p.a.
used.js
  listUsed({model,fuel,minPrice,maxPrice,minYear,maxYear,maxKm,transmission,owners,sort,page,pageSize,status}) -> {items:[usedCard], total, page, pageSize, facets:{models:[],fuels:[],years:[min,max],price:[min,max]}}
  getUsed(stockSlugOrId)             -> {id,stock_id,slug,model,variant,title,year,km,owners,fuel,transmission,color,price,status,reg_masked,location,highlights,inspection:{score,sections:[{name_en,name_hi,items:[{label_en,label_hi,status:'ok'|'attention',note}]}]},photos:[url],emi_from,warranty_en,warranty_hi} | null
sales.js (bookings/leads create – used by public forms)
  listShowrooms()/listWorkshops()    -> [{id,slug,name,address_en,address_hi,phone,lat,lng,hours}]
  listTestDriveSlots({showroomId,modelId,date}) -> [{time:'10:00',available:true,demoCarId}]   // slot taken if that demo car already booked in that slot
  createTestDrive({name,phone,email,showroomId,modelId,variantId?,date,time,consent,lang}) -> {booking, lead, assignee:{name,phone}}  // transactional, double-booking impossible (throws 409)
  listServiceSlots({workshopId,date}) -> [{time,capacity,remaining}]
  createServiceBooking({name,phone,regNo,model,workshopId,date,time,serviceType,pickupDrop,notes,consent,lang}) -> {booking}  // respects bay capacity; 409 if full
  createLead({source,name,phone,email,city,showroomId,modelId,variantId,usedId,type,message,tradeIn:{make,model,year,km,expectedPrice},budget,consent,lang}) -> {lead, assignee}
  optOut({phone}) -> {updated:n}
```
HTTP mirrors (JSON): `GET /api/models`, `/api/models/:slug`, `/api/cities`, `/api/onroad?variant=ID&city=slug&accessories=0|1`, `/api/emi?...`, `/api/used?...`, `/api/used/:id`, `/api/showrooms`, `/api/workshops`, `/api/slots/test-drive?showroom=&model=&date=`, `/api/slots/service?workshop=&date=`, `POST /api/test-drive`, `POST /api/service`, `POST /api/leads` (public enquiry / trade-in / finance), `POST /api/opt-out`.
Staff/admin HTTP (session cookie): `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`;
`GET /api/staff/leads?status=&q=&mine=1&showroom=&source=&breached=1&page=`, `GET /api/staff/leads/stats` (counts per status, % first-response ≤5 min, breached count, avg response min, per consultant), `GET /api/staff/leads/:id` (lead + events + messages + `ai:{summary,draft}`), `PATCH /api/staff/leads/:id {status,notes}`, `POST /api/staff/leads/:id/reassign {user_id,reason}`, `POST /api/staff/leads/:id/ai` (regenerate), `POST /api/staff/leads/:id/reply {text,channel,confirmed_edit}`, `POST /api/staff/leads/import {csv, source, dryRun}` → `{created,duplicates,errors:[{row,message}],preview}` (flexible portal header mapping: name/phone/mobile/email/model/city/message/…; dedupe on phone+model within 7 days), `GET /api/staff/consultants`, `GET /api/staff/bookings?type=test_drive|service`, `PATCH /api/staff/bookings/:id {status}`.
Admin CRUD under `/api/admin/{models,variants,price-rules,cities,offers,banners,used,showrooms,workshops,demo-cars,users,past-sales}` (GET list, POST create, GET/PUT :id, DELETE :id), `GET /api/admin/used/:id/suggestion` (used_manager/admin only), `POST /api/admin/upload {dataUrl,name}` → `{url}`, `GET /api/admin/export/dms.csv`, `GET /api/admin/audit` (audit log of price/used/user changes).
Validation: phone = Indian mobile (10 digits, starts 6–9, accept +91/0 prefix, normalised to 10 digits); email optional but valid; name 2–80 chars; all text sanitised/escaped on output (frontend escapes every interpolated value via `esc()`); rate-limit public POSTs (e.g. 20/min per IP, in-memory).

## Frontend pages (frontend dev builds all, SSR; each has unique `<title>`, meta description, canonical, hreflang en/hi, Open Graph, JSON-LD (Vehicle/Product+Offer for models & used cars, AutoDealer/LocalBusiness on home/contact, BreadcrumbList))
Public: `/` · `/new-cars` · `/new-cars/:slug` (gallery, colours, variants, city selector → live on-road breakup via fetch w/ SSR default Lucknow, EMI mini-calculator, sticky CTA bar "Book test drive" + price, offers) · `/used-cars` (filters, grid, sort, pagination via query params, SSR) · `/used-cars/:slug` (photos, masked reg, inspection report, price, EMI, enquiry/test-drive CTA, reserve-interest form) · `/test-drive` (stepper: model → showroom → date → real slots → details+consent) · `/service` (workshop → date → slot with remaining bays → details+consent) · `/emi` · `/trade-in` · `/contact` (showrooms, map link, hours) · `/privacy` (DPDP notice, rights, grievance contact) · `/opt-out` · `/sitemap.xml` · `/robots.txt` · custom 404/500.
Staff (noindex): `/staff/login` · `/staff/leads` (inbox: filters, SLA countdown chips, assignee, status; detail drawer with AI summary, draft reply editor with confirm-before-send, activity timeline, reassign, status) · `/staff/import` (CSV upload with preview/dry-run + error rows) · `/staff/bookings` · `/admin` (dashboard KPIs: SLA %, leads/day, test drives, service utilisation) · `/admin/models` · `/admin/prices` (price-rules table per city/model, inline edit, validity date, preview calculator) · `/admin/used` (stock table, status, inspection editor, AI price band visible to used_manager/admin only) · `/admin/offers` · `/admin/banners` · `/admin/users` · `/admin/showrooms`. Staff/admin UIs are vanilla-JS pages using the staff/admin APIs above.

## Design system (frontend)
Premium-showroom minimalism: white `#fff` / warm off-white `#f6f5f2` surfaces, ink `#111`, grey scale, **ONE accent colour (deep crimson `#B3122D`)** used only for primary CTAs, active states and key numbers. Large photography-first hero, generous spacing (8px grid, section padding 96px desktop / 56px mobile), type scale with fluid `clamp()`, 1 sans family (system stack), thin 1px borders, 12px radius, subtle motion (respect `prefers-reduced-motion`). Mobile-first (most buyers on phones): sticky bottom CTA on car pages, 44px touch targets, WCAG AA contrast, visible focus. Car "photography": until real photos are uploaded via admin, render high-quality procedurally generated SVG car side views (served by backend/frontend at `/img/car/:modelSlug.svg?c=hex`, silhouette per body type on soft gradient studio floor) – every image slot accepts an uploaded URL override. Every car page shows a price and one clear next step.

## Quality bars
Lighthouse-style: HTML < 60 KB per page gzipped, CSS < 40 KB, JS per page < 30 KB, no render-blocking third-party. Accessibility labels, error messages inline, forms work without JS where practical (POST fallback to same endpoints returning redirect). DPDP: consent checkbox unchecked by default on every form collecting personal data + link to /privacy, opt-out page.
Everything must run offline/locally from seed data, and be deployable (Dockerfile + README deploy section: Docker, Render/Railway, or Windows service behind nginx).
