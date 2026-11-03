# QA Report - Company A Motors (Round 3)

Tester: QA lead. Fresh seeded DB, port 3400 (RATE_LIMIT_PUBLIC=5000), headless Edge via CDP. No app code edited. New/updated tests: `tests/e2e/rbac.js` (122 API checks: RBAC, sessions, OTP, CSRF, forced change), `tests/e2e/browser3.js` (visuals + perf), `browser3_customer.js` (account flow), `browser3_staff.js` (every role UI), `probe.js` (ad-hoc CDP probe); `run.js` CSV-import section now logs in as lead_desk (consultants lost `lead.import` by design). Rounds 2 and 1 follow unchanged.

## Round 3 score: 79 / 100 (round 2: 91)

| Area | Max | R3 | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 26 | Customer OTP login, prefill, test-drive booking, cancel, add vehicle, saved cars, export, delete request, withdraw consent and sign-out all work in a real browser. Every role's menu/landing/pages are correct; desk assign, service-board move, role-matrix edit work. Deductions: story section visual does not stay sticky (R3-04); lightbox, inspection-ring animation and filters drawer never initialise because of a JS crash on every page (R3-01). |
| Backend / security | 20 | 16 | Strong: dealer_principal 403 on all 51 mutating calls; consultant/manager/advisor data scoping; AI band only admin+used_manager; role edit effective on live sessions and audited; logout, revoke-all, deactivate, role-change all kill live sessions; forced-change gate; login lock (429 after 5); CSRF text/plain blocked; customer/staff cookies isolated; customer data isolation. Deductions: content_editor can change price inputs (R3-02, Major); password policy is length-only (R3-06). |
| Frontend UX / design | 20 | 15 | Real photos plus cinematic hero, marquee, tilt cards, compare tray, staff shell and exec dashboard look premium and cohesive; staff pages have no horizontal scroll at 390. Deductions: broken sticky story (R3-04), legible number plates (R3-05), duplicated/branded photos (R3-11), minor staff UI issues. |
| SEO / perf / a11y | 10 | 6 | HTML 6 KB gz, CSS 11 KB gz, JS 6 KB gz, images cached 30 days. But home transfers 2.69 MB (target 1.5 MB) and LCP is 7.5 s on throttled 1.6 Mbps/150 ms/4x CPU (R3-03); a console exception on every page (R3-01). No horizontal scroll at 390 and no broken images on any public page tested. |
| i18n + DPDP | 10 | 9 | Hindi works on /compare, /account, /credits and home. Export/delete/withdraw requests recorded and audited. Staff UI English only (documented). |
| Deployability / docs / tests | 10 | 7 | `npm test` 53/53. README login table and docs are stale (R3-07). Docker still unbuilt (N-02). |
| **Total** | **100** | **79** | |

## Round 2 open items
| ID | Status |
|---|---|
| D-12 | Still open (Minor, Frontend): home still shows hard-coded "6,000+ / 900+". |
| N-01 | Fixed: AI summary now reads "model not specified yet". |
| N-02 | Still open (Manager): no Docker on QA machine; Dockerfile not build-tested. |

## Suite results
- `npm test` 53/53. `node tests/e2e/run.js`: all pass except the CSV-import block, which logged in as a consultant (now correctly 403); test updated to lead_desk.
- `tests/e2e/rbac.js`: 118/122. The 4 fails: 2 real defects (R3-02 x2), 1 test artefact (password reused after the policy probe), 1 expectation of OTP lock in mock mode (mock accepts 123456 by design; with OTP_MODE=real wrong codes get 400/401, no bypass). Page matrix 200/403 confirmed for admin, principal, desk, manager, consultant, used, content, service, workshop roles.
- Browser: customer flow 7/11 and public sweep 88/112; every failure is the R3-01 console exception (functional checks pass).

## New defects (round 3)
| ID | Sev | Owner | Issue and repro |
|---|---|---|---|
| R3-01 | Major | Frontend | `public/js/fx.js:64`: `A.$('.stage img.stage-img, .gal img').filter(...)`. `A.$` is querySelector, so this throws `TypeError ... reading 'filter'` on EVERY public page. Everything after it never runs: gallery lightbox, inspection-ring animation (line 76), filters drawer (line 77). Fix: use `A.$$`. |
| R3-02 | Major | Backend | content_editor can change prices. Log in as content@companya.in: `PUT /api/admin/models/1 {"accessories_amount":1}` -> 200 (was 18500); `PUT /api/admin/offers/1 {"amount":77777}` -> 200 (cash offer shown in on-road price). Both are in the audit log under content@. Restrict those fields to prices.write/admin. |
| R3-03 | Major | Frontend | Home weight 2.69 MB transferred (2.66 MB images, 25 requests; five 225-245 KB scene JPGs plus ~200 KB car heroes), above the ~1.5 MB bar. Slow-4G + 4x CPU: load 7.0 s, LCP 7.5 s. Use srcset/WebP at ~60-80 KB, preload only the hero. Other pages: /new-cars 643 KB, model page 189 KB, /used-cars 1.0 MB. |
| R3-04 | Major | Frontend | Home "story" section: `.story-vis` should be sticky but scrolls away (rect top -323 at scroll 500), leaving the left half blank for ~1,800 px on desktop; on mobile the steps are big empty gaps. Likely ancestor overflow or grid stretch; add `align-self:start`. |
| R3-05 | Major | Manager (assets) | Registration plates legible in used-car photos (blue SUV "MH14 TC ..." card on /used-cars; Kia card). Brief requires masked registration; IMAGE_CREDITS admits plates are not all blurred. Blur or replace. The text reg no. is masked correctly (UP32 •• ••34). |
| R3-06 | Minor | Backend | Password policy is length-only (10): `abcdefghijkl` and the user's own email are accepted; no common-password check. |
| R3-07 | Minor | Manager | README demo-login table lists 4 of 17 seeded users; missing principal@ (Principal@123), desk@ (Desk@123), manager.gomti/aliganj/alambagh@ (Manager@123), ravi@, sunita@, content@ (Content@123), service2@, wm.amausi@ (Workshop@123). Checklist still says "replace placeholder car art". No mention of OTP_MODE, /account, /compare, /exec. With NODE_ENV=production (Dockerfile) OTP is real but the only provider is a mock logger, so customers cannot sign in in production until messaging is wired; seeded demo passwords are not force-changed. run.bat itself is consistent. |
| R3-08 | Minor | Frontend | Anonymous /account logs a 401 console/network error (`GET /api/customer/me`). |
| R3-09 | Minor | Frontend | /staff/desk shows "Breached +35675:03" (unbounded mm:ss on old seed leads); show h/d. |
| R3-10 | Minor | Frontend | /admin/roles saves on a single checkbox click with no confirm or undo (one click granted admin.read to consultant). |
| R3-11 | Minor | Manager (assets) | Photos are real Tata/Kia/VW/Hyundai/Honda cars with visible badges for fictional "Brand X"; same image reused for different stock (three gold hatchbacks, two Honda City; 2022 Model C listed "Red" but photo is white); hero is CC BY-SA 4.0 with "contact before commercial use". Needs licence/brand sign-off. |
| R3-12 | Minor | Backend | `/api/staff/consultants` and the desk Assign list include admin, managers and used manager, so a lead can be assigned to the Administrator account. |
| D-12 | Minor | Frontend | (carried) hard-coded home stats. |
| N-02 | Minor | Manager | (carried) Docker build untested. |

## Verified OK
Customer: OTP request rate limit, customer cookie blocked from all staff APIs/pages and vice versa, cross-customer vehicle/booking edits denied, export is an attachment with own data only, CSRF blocked, logout kills session. Staff: principal UI fully read-only and every API write 403; consultant cannot read/patch/reply/reassign other showrooms' leads or import CSV; manager sees own showroom only; service_advisor limited to own workshop; AI band only admin/used_manager; exec only admin+principal; role edit removed a permission from a live session at once and is audited; deactivate/role change/revoke-all/logout kill live sessions; forced-change gate; login lock after 5 fails. Compare tray, saved-car sync, booking prefill, service-board move, desk assign, users screen and demo-accounts helper all worked in the browser.

---

# QA Report - Company A Motors (Round 2)

Tester: QA lead. Fresh seeded DB on port 3300 (RATE_LIMIT_PUBLIC=5000). No application code edited. Round 1 report follows below, unchanged.

## Round 2 score: 91 / 100 (round 1: 79)

| Area | Max | R1 | R2 | Why |
|---|---|---|---|---|
| Functionality vs brief | 30 | 25 | 28 | All flows still pass; stepper fixed. Deduction: AI summary reads "interested in not specified" when no model is chosen (N-01), home stats are still hard-coded (D-12). |
| Backend correctness / security | 20 | 17 | 19 | D-03, D-09, D-10 fixed and covered by new tests. Deduction: no DB-level reseed/--reset issue found, but `status=booked` used cars are listable and the booked detail page is 200 by design; kept as a note only. 1 point for unverified Docker build. |
| Frontend UX / design | 20 | 15 | 17 | Login feedback, stepper, tap-target CSS (44 px), AI box, silhouettes, sticky CTA fixed. Look matches DriveX reference (white/black, one red accent, ghost DRIVE watermark, skewed red tile, pill buttons). Deduction: car art is still generic placeholder silhouettes (Model H still slightly wagon-like) and the hero ghost text collides with the car card. |
| SEO / perf / a11y | 10 | 8 | 9 | JSON-LD now on /privacy and /opt-out. Tap targets verified from CSS and the FAST browser run only (full 390 px sweep not re-run). |
| i18n + DPDP | 10 | 9 | 9 | Unchanged, passing. Staff UI English only (documented). |
| Deployability / docs / tests | 10 | 5 | 9 | README exists, commands and logins verified (seed, start, npm test, e2e, admin login). Tests 27/27. Deduction: Dockerfile not built (no Docker here). |
| **Total** | **100** | 79 | **91** | |

## Suite results
- `npm test`: 27/27. `node tests/e2e/run.js`: 442/442 (D-03/D-07 now pass). Browser suite with FAST=1 (login wrong/right password, lead inbox, drawer, reply, admin price edit, stepper, admin pages): 89/89. The full ~20 min public sweep was not re-run; screenshots of home, new-cars, model page, test-drive (390) and staff drawer (390/1440) were read and judged.
- Re-seed on an existing DB is idempotent ("already seeded, use --reset"); counts unchanged. run.bat logic is sane (node check, seed on first run, start).

## Round 1 defect status
| ID | Status | Verification |
|---|---|---|
| D-01 | Fixed | staff.js skips redirect for /api/auth/login; browser suite wrong-password test passes. |
| D-02 | Fixed | 390 px step 1 shows only Continue (screenshot). |
| D-03 | Fixed | CRLF `_next` returns 201 with no 500/header injection; `//evil.com` becomes same-origin `/evil.com?ok=1`. |
| D-04 | Fixed (CSS) | 44 px min-height on nav, pills, buttons, swatches, hearts, dots, footer links. Runtime sweep not re-run. |
| D-05 | Fixed | AI box shows summary, next best action, Regenerate only. |
| D-06 | Fixed, minor residue | Model H is now a hatch shape; art still generic. |
| D-07 | Fixed | 1 JSON-LD block on /privacy and /opt-out. |
| D-08 | Fixed | README.md present and accurate. |
| D-09 | Fixed | `/api/used?status=sold` returns only available cars. |
| D-10 | Fixed | New test covers load balancing. |
| D-11 | Fixed | CTA no longer covers breakup rows at 1440 (screenshot). |
| D-12 | Still open (Minor) | Numbers rounded to 6,000+ / 900+ but still hard-coded in server/pages/public.js, not from admin settings. |

## Open defects (round 2): 0 Blocker, 0 Major, 3 Minor
| ID | Sev | Owner | Issue |
|---|---|---|---|
| D-12 | Minor | Frontend | Home stat figures hard-coded (6000/900), not admin-driven or removed. |
| N-01 | Minor | Backend | AI summary with unspecified interest reads "is interested in not specified." Should omit the clause. |
| N-02 | Minor | Manager | Dockerfile never build-tested by QA (no Docker on the QA machine); needs a real `docker build` + `/healthz` check before go-live. |

Also noted: 4 showrooms in seed vs "3 showrooms" in the brief wording of README/home (home count comes from DB, so it is consistent).

---

# QA Report - Company A Motors (Round 1)

Tester: QA lead. Environment: Node 22.17, Windows 11, fresh seeded temp DB on port 3200, headless Edge 156 (CDP) for browser checks. No application code was edited.

## Score: 79 / 100

| Area | Max | Score | Why |
|---|---|---|---|
| Functionality vs brief | 30 | 25 | Every page and flow works. On-road math, masking, double-booking, bay capacity, auto-assign, SLA, CSV import, opt-out and AI gating are correct. Deductions: stepper nav buttons wrong on step 1, noisy AI box, silhouettes not matching body types. |
| Backend correctness / security | 20 | 17 | RBAC, CSRF, rate limit, lockout, SQLi, XSS storage, path traversal, upload CSP all hold. Deductions: CRLF in `_next` gives a 500 (after the lead is stored), sold stock listable via public API, specialty rule can starve a specialist. |
| Frontend UX / design / responsive | 20 | 15 | Strong DriveX-style look (white/black/one red accent, ghost "DRIVE" watermark, skewed red tiles, pill buttons). No horizontal scroll at 390px on any page, no console errors. Deductions: wrong-password login gives no feedback (Major), many sub-40px tap targets, floating CTA overlaps the price table on desktop. |
| SEO / performance / a11y | 10 | 8 | Unique title/description/canonical/hreflang/OG/JSON-LD; HTML 4-5 KB gz, CSS 6 KB gz, JS <4 KB gz, TTFB about 210 ms local. Deductions: /privacy and /opt-out have no JSON-LD, tap targets. |
| i18n + DPDP | 10 | 9 | Hindi really translates all 12 public pages (Devanagari content, title, on-road breakup helper); unchecked consent boxes, /privacy link, working opt-out that blocks messaging. Staff/admin UI is English only (documented). |
| Deployability / docs / tests | 10 | 5 | `npm test` 24/24, Dockerfile + /healthz + auto-seed. No README.md exists (contract promises seed logins and deploy docs there). |
| **Total** | **100** | **79** | |

## Defect count: 0 Blocker, 1 Major, 11 Minor (12 total)

## Defect table

| ID | Sev | Area | Owner | Repro | Expected vs actual |
|---|---|---|---|---|---|
| D-01 | Major | Staff login UX | Frontend | `/staff/login`, enter a valid email and a wrong password, submit. | Inline "Invalid email or password". Actual: `public/js/staff.js` `S.api` treats every 401 as "signed out" and does `location.href='/staff/login?next=...'`, so the page reloads, the form is wiped and no message is shown (the `.catch` in the login handler never runs). Fix: skip the redirect for `/api/auth/login`. |
| D-02 | Minor | Test-drive stepper | Frontend | `/test-drive` at 390px, step 1. | Only "Continue" visible on step 1. Actual: "Back" and "Confirm booking" are shown together with "Continue" on step 1 (screenshot `_test_drive_m.png`). |
| D-03 | Minor | Form fallback | Backend | `POST /api/leads` urlencoded with `_next=/contact%0d%0aSet-Cookie:%20x=1`. | Safe redirect or 400. Actual: 500 "Internal server error" from `router.redirect` (header injection rejected by Node), after the lead was already created (a duplicate-submit risk). Sanitise `_next` (strip CR/LF, require single leading `/`). |
| D-04 | Minor | Mobile tap targets | Frontend | 390px: `/` (13 controls), `/new-cars` (6), `/used-cars` (14) have links/buttons/inputs under 40 px. | Contract: 44 px touch targets. |
| D-05 | Minor | Staff drawer | Frontend | Open any lead. | Clean AI summary. Actual: the AI box prints raw keys: empty "Needs / Budget / Timeline" rows, a "Text" row duplicating the summary, "Source: heuristic", "Generated by: AI-generated...". |
| D-06 | Minor | Visual fidelity | Frontend | `/new-cars`, home hero. | Model H (hatchback) is drawn as a long station-wagon; looks like an estate, not a hatch. Silhouettes are generic. |
| D-07 | Minor | SEO | Frontend | `/privacy`, `/opt-out` page source. | Brief says every page has JSON-LD. Actual: none on these two (BreadcrumbList would suffice). |
| D-08 | Minor | Docs | Manager / Backend | Look for `README.md`. | Contract promises README with seed logins and deploy section. Actual: absent. |
| D-09 | Minor | Public API | Backend | `GET /api/used?status=sold`. | Sold cars should not be browsable. Actual: anonymous users can list sold stock (masking still correct). |
| D-10 | Minor | Lead assignment | Backend | Priya (no specialty) has 20+ open leads, Rahul (specialty S, V) 5; new Model C/H leads at Gomti Nagar always go to Priya. | Fewest-open should balance. Actual: a consultant with a non-empty specialty is excluded from every other model, so workload skews. Suggest tier 1 = specialists for that model, tier 2 = all at showroom ranked by open count. |
| D-11 | Minor | Desktop UI | Frontend | `/new-cars/model-h` at 1440x900. | Sticky CTA pill floats over the breakup rows (Insurance, Handling) so values are hidden until scrolled. |
| D-12 | Minor | Content | Frontend | Home stat strip "5,981+ cars delivered a year" counting up. | Numbers should come from admin/settings. Actual: marketing figures hard-coded in the page (not prices, but unverifiable claims). |

Not defects but noted: staff mobile header wraps (brand and tabs stack, acceptable); `/ui/onroad` and `/api/offers` are public by design; admin deleting a price rule leaves the city "no rule" and the site correctly shows the "price being updated" fallback.

## What passed (verified)

- `npm test`: 24/24 pass. E2E `node tests/e2e/run.js`: 439/442 (the 3 are D-03, D-07 x2). Browser `node tests/e2e/browser.js`: 249/254 (the 5 are D-04 x3, D-01, and 1 flaky status-filter timing assertion that I could not reproduce by API).
- All 16 public pages return 200; unique titles and descriptions; canonical, hreflang en/hi/x-default, OG tags, valid JSON-LD (Product/AggregateOffer on models, Vehicle/Offer on used, AutoDealer on home, BreadcrumbList). Models and used cars are indexable; /staff, /admin, /api, /forms, /ui disallowed in robots.txt; every sitemap URL returns 200. Custom 404 (no stack trace); malformed URLs and weird query strings do not 500.
- **On-road**: recomputed by hand for all 6 cities x all active variants from `/api/admin/price-rules` (road tax 8% / 10% above Rs 10 lakh, registration, insurance 3.1%, handling, FASTag, TCS 1% above Rs 10 lakh, minus cash offers with show_in_onroad). 0 mismatches. Example Model H LX Lucknow: 9,85,000 + 78,800 + 1,500 + 30,535 + 4,500 + 600 - 15,000 = Rs 10,85,935. NEW-H-02 = Rs 12,45,000 automatic petrol, TCS line present. Validity date and "may change" note (en+hi) present. Editing a price rule in the admin UI (browser, inline input) changed the public on-road price by exactly the edit and was restored; setting `valid_until` in the past gives `expired:true` and the page/helper show "Price being updated - request a quote"; a missing rule also falls back. Model-specific override row works.
- **Used cars**: UC-1182 (Model C VX Diesel 2022, 41,200 km, Rs 8,45,000, available) and UC-1190 (Model S LX Petrol 2021, 58,600 km, Rs 5,12,000, booked) correct. Full registration numbers (read from the admin API) appear in none of: public JSON, list and detail HTML (en and hi), sitemap, JSON-LD, consultant lead API. Masked as `UP32 •• ••34`; middle characters absent. Price-band suggestion: 401 anonymous, 403 consultant, 200 used_manager and admin; no AI fields in the public used JSON.
- **Leads**: consent required (missing, false, "false" all 422), phone validation and +91 normalisation, short name and bad email rejected; auto-assign by showroom (assignee belongs to the lead's showroom); due_at = created + 5 min; SLA chip shows countdown, breached state and filter; status change sets first_response_at; reassign and reply work; replies containing discount, percent or amount language are rejected (422) and unconfirmed replies are rejected; AI draft contains no discount language; ack message queued; opt-out marks leads, blocks replies and acks for that phone.
- **Test drive / service**: slots list; 409 once the demo cars for that model/showroom/slot are exhausted; 6 concurrent bookings cannot exceed demo cars; past dates and missing consent rejected; service bay capacity (6) enforced exactly (7th = 409, remaining = 0).
- **CSV import**: BOM, messy headers (Customer Name, Mobile No., E-mail ID, Car Model), quoted commas, escaped quotes, embedded newlines, +91 phone formats, dry-run creates nothing, duplicates and bad phones reported with row numbers, re-import yields 0 new, empty CSV 4xx, injection in source not 500. Browser import page: preview, error rows, real import all ran without JS errors.
- **Security**: anonymous blocked on all /staff and /admin APIs (401); consultant 403 on all admin APIs and HTML admin pages; service advisor cannot read leads; used_manager cannot edit price rules; text/plain and urlencoded cross-site POST without header rejected (403); session cookie HttpOnly + SameSite; forged cookie rejected; logout invalidates; login lockout after 5 failures (429) even for the correct password; public POST rate limit 20/min (429); no password hashes in any API; SQLi in login, onroad, used filters, import source: no 500, tables intact; stored XSS payloads (script/img in lead names, messages, CSV) are stripped or escaped and never executed in the staff inbox or import preview (checked in a real browser); reflected-XSS probes on 8 pages clean; open redirect via `_next` (https:// and //host) blocked; >5 MB body rejected; bad JSON 400; static path traversal, /data, /server not exposed; uploads served with sandbox CSP.
- **i18n**: `?lang=hi` sets the cookie, html lang, and 12 pages carry hundreds of Devanagari characters vs near none in English; no key English CTA strings left; Hindi titles; Hindi on-road breakup.
- **DPDP**: consent checkbox unchecked by default and /privacy link on every personal-data form; privacy notice covers rights, withdrawal, grievance contact.
- **Browser (Edge headless, desktop 1440 and mobile 390)**: zero JS exceptions, console errors, failed requests or broken images on all public pages, staff login, lead inbox (filters, search, drawer, reply, discount-reply rejection, status/notes save, reassign, AI regenerate), import, bookings, and every admin page (dashboard, models, prices incl. live calculator and inline edit, used stock + AI band, offers, banners, showrooms, users). No horizontal scroll anywhere at 390 px; one h1 per page; all form controls labelled.
- **Performance** (local): HTML gz 4-5 KB, app.css 6.2 KB gz, largest JS 3.9 KB gz, immutable caching on /css /js /img, security headers + CSP. Real 4G Lighthouse not run (no Lighthouse available); by size and TTFB the 2.5 s target is comfortably met.

## Not verified / limits

No real device testing, no Lighthouse score, no screen-reader pass, no formal contrast measurement (spot-checked visually only). Staff/admin UI Hindi is out of scope by design.

## Repeatable suites

- `BASE_URL=http://localhost:3200 RATE_LIMIT_PUBLIC=5000 node tests/e2e/run.js` (API/SEO/security; mutates data, use a throwaway DB; run with `RL_TEST=1` against a default-limit server to exercise the 429 check).
- `BASE_URL=... node tests/e2e/browser.js` (needs Edge/Chrome; `FAST=1` skips the public page sweep; takes about 20 minutes because of settle waits). Screenshots go to `%TEMP%\qa-shots`.
- Caution for rounds: the browser suite changes and restores one price rule; reseed between runs for determinism.
