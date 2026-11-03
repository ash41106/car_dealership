# RESEARCH - Company A Motors (prioritised, ideas only)

Evidence note: only 2 live searches were run (UP road tax; GitHub repos). Everything else is from background knowledge of the named sites and Indian rules. Items marked (verify) must be checked with the UP Transport Dept, the insurer, or counsel before go-live. Repo licences were NOT confirmed from the repo pages.

## A. Top 15 ideas (impact vs effort, best first)

1. [frontend+backend] Single "On-road price" card with city selector and itemised breakup (ex-showroom, road tax, registration, insurance, handling, FASTag, TCS, less offer, total). Show the total big, lines collapsible, "valid until" date. Cars24, Spinny, CarDekho and CarWale all lead with this. Price comes only from `price_rules`. Persist the chosen city in a cookie.
2. [frontend] Sticky mobile bottom CTA bar on model and used-car pages: price on the left, "Book test drive" (primary) and a WhatsApp/Call icon on the right. Add a `tel:` link and a `wa.me` deep link with prefilled text including the model and stock ID. Keep it at least 48px tall and respect safe-area insets.
3. [backend] SLA timer made visible: `due_at` is computed server-side and the UI renders a countdown chip (green >3 min, amber <3, red breached). Refresh with a 15 s poll, no websockets. Sort the inbox by breach risk first.
4. [frontend] Test-drive stepper with real slots: model, showroom, date strip (next 7 days), slot chips greyed when taken, a confirmation screen with an "Add to calendar" .ics download, and the consultant's name and phone. This is the Tesla/Volvo pattern (few fields, instant confirmation). Ask for only name, phone and consent in the first pass.
5. [backend] Atomic slot booking: a UNIQUE(demo_car_id, date, time) constraint plus a transaction, and 409 on conflict. Do not rely on a check-then-insert.
6. [frontend] Used-car inspection report: a score ring (e.g. 128/140), accordion sections with pass/attention icons, "attention" items shown first with notes, and a "what we fixed" line. Spinny and Cars24 show this, and it builds trust. Add a 7-day money-back / warranty chip if the business offers one (do not invent terms).
7. [frontend] EMI calculator: sliders plus numeric inputs for down payment, rate and tenure, a donut chart (principal vs interest) in inline SVG, and a "Check eligibility" CTA that creates a finance lead. Default tenure is 60 months. The rate is admin-editable text with the label "indicative". Compute in vanilla JS and mirror it on the server with the same formula.
8. [frontend+backend] DPDP-compliant consent: an unticked checkbox, specific purpose text ("contact you about your test drive via call/SMS/WhatsApp"), a link to the privacy notice, a language toggle, and a separate optional marketing tick. Store text version, timestamp, IP hash and language. See section C.
9. [backend] WhatsApp/SMS templates keyed by event and language, with variables and a hard opt-out check before queueing. Section C lists norms.
10. [frontend] SEO structured data: AutoDealer/LocalBusiness per showroom, Car/Vehicle plus Offer per used car, BreadcrumbList, hreflang en/hi, and a sitemap with lastmod. See section C.
11. [frontend] Hindi toggle in the header on every page (the lang cookie persists). Use the Devanagari font stack, keep numerals in the Indian grouping (12,45,000) via `toLocaleString('en-IN')`, and make sure the Hindi strings fit the buttons.
12. [frontend] Used-car filters in the URL (`?fuel=diesel&maxKm=50000`), with sticky filter chips on mobile, a "Sort by price/km/year" control, SSR pagination, and a "Booked" ribbon on reserved cars (not hidden). Plus a compare-lite "similar cars" row.
13. [backend] Lead dedupe and merge: same phone plus model within 7 days adds an event instead of a new lead. Show the "returning customer" badge to the consultant. This matters for CSV portal imports.
14. [frontend] Price-expiry UX: when `expired:true`, replace the price with "Price being updated - request a quote" and keep the EMI calculator usable on the last known ex-showroom value, clearly labelled.
15. [backend] An audit log on price rules and used-car prices, plus an admin "preview calculator" next to the rule table (apply a rule and see the breakup for a sample variant). This prevents costly pricing mistakes.

Quick wins for performance: system fonts only, inline critical CSS, `loading=lazy` plus width/height on all images, and one gzip'd CSS file.

## B. GitHub repos worth a look (licences must be verified; none confirmed from the repo page)

| Repo | Worth borrowing (ideas only) | Licence |
|---|---|---|
| github.com/mbeps/car-dealership | Browse/filter UX, automated test-drive slot management preventing double bookings, admin booking portal | not confirmed (verify) |
| github.com/amjustgettingstarted/ai-x-car- | Marketplace layout, EMI calculator component structure, test-drive booking flow | not confirmed (verify) |
| github.com/twentyhq/twenty | Modern CRM pipeline/kanban and activity timeline UX | AGPL-3.0 (from memory; ideas only) |
| github.com/frappe/crm | Lead statuses, assignment rules, SLA-style fields | AGPL-3.0 (from memory) |
| github.com/espocrm/espocrm | Lead-assignment and workflow rule concepts, duplicate check | AGPL-3.0 (from memory) |
| github.com/alextselegidis/easyappointments | Slot generation with capacity and working-hours logic (useful for service bays) | GPL-3.0 (from memory) |
| github.com/calcom/cal.com | Booking UI: date strip, slot chips, timezone-free confirmation, .ics | AGPL core (from memory) |
| github.com/schemaorg/schemaorg (examples) | Vehicle/Car/AutoDealer JSON-LD reference | Apache-2.0 / CC-BY-SA |

Given the copyleft licences, do not copy code; reimplement from the concept. No single open-source project covers dealer plus CRM plus EMI, which supports building in-house.

## C. India-specific accuracy

### On-road price composition
- Ex-showroom price (basic + GST 28% + cess for cars, already in the ex-showroom figure; do not add GST again).
- Road tax: a state levy, a % of ex-showroom (some states use invoice value). UP (searched July 2025 sources): about 8-9% up to Rs 10 lakh and 11% above, with the Cars24 and Zurich Kotak pages citing an April 2025 notification. Older sources say 10%, and an October 2025 report says the EV/hybrid waiver ended. Treat as admin-editable and (verify) at go-live. Delhi: about 4% (price under Rs 6 lakh), 7% (6-10 lakh), 10% (above 10 lakh) from memory (verify); Delhi also levies a small green/other cess.
- Registration and smart-card fee: roughly Rs 600-1,500 in UP; seed Rs 1,000 (verify).
- Insurance: first-year comprehensive, usually 3-4% of ex-showroom for petrol and a little higher for diesel and for premium cars; many dealers also bundle zero-depreciation. Seed 3.5%.
- TCS: 1% of ex-showroom when above Rs 10 lakh (Sec 206C(1F)); keep the threshold configurable. It is recoverable by the buyer via income-tax credit, so label it clearly.
- FASTag: about Rs 500-600 (tag plus first balance); seed Rs 600.
- Handling/logistics: dealer-defined, Rs 5,000-15,000 (seed Rs 8,000).
- Accessories/extended warranty: optional, always shown as toggled-off by default.
- Never state "total with no hidden charges"; use the contract note ("indicative").

### Realistic seed values for `price_rules`
| City | Road tax below/at Rs 10L | Road tax above Rs 10L | Registration | Insurance % | Handling | FASTag | TCS |
|---|---|---|---|---|---|---|---|
| Lucknow | 9% | 11% | 1,000 | 3.5% | 8,000 | 600 | 1% above 10L |
| Kanpur | 9% | 11% | 1,000 | 3.5% | 8,000 | 600 | same |
| Varanasi | 9% | 11% | 1,000 | 3.5% | 8,000 | 600 | same |
| Prayagraj | 9% | 11% | 1,000 | 3.5% | 8,000 | 600 | same |
| Gorakhpur | 9% | 11% | 1,000 | 3.5% | 8,000 | 600 | same |
| Delhi NCR | 7% (6-10L), 4% (<6L) | 10% | 3,000 | 3.5% | 10,000 | 600 | same |

Worked check for the seed variant NEW-H-02 (ex-showroom Rs 12,45,000, Lucknow): road tax 11% = 1,36,950; insurance 3.5% = 43,575; registration 1,000; handling 8,000; FASTag 600; TCS 1% = 12,450; total approx Rs 14,47,575. The seed `valid_until` should be about 30 days ahead.

### DPDP Act 2023 UX (verify wording with counsel)
- Consent must be free, specific, informed, unconditional, unambiguous, with a clear affirmative action (no pre-ticked boxes).
- Give a notice at or before collection: what data, why, how to withdraw, how to complain to the Data Protection Board, and the grievance officer's contact.
- Withdrawal must be as easy as giving consent: every message should carry an opt-out path, `/opt-out` page, and a "STOP" keyword on WhatsApp/SMS.
- Offer the notice in English and Hindi (Eighth Schedule languages are expected in the rules).
- Collect only what is needed (the test drive needs name and phone; email optional). Keep a retention period and delete or anonymise old leads.
- Children's data: do not collect; add an 18+ note on forms.
- Keep the consent record (text version, timestamp, language, IP hash) as the contract prescribes.

### WhatsApp/SMS templates
- SMS (India): TRAI DLT registration is needed for the entity, header (sender ID) and each template. Variables use `{#var#}`. Transactional/service SMS to opted-in leads differ from promotional SMS; do not send promotions to DND numbers.
- WhatsApp Business: only pre-approved Meta templates can open a conversation outside the 24-hour window. Categories: Utility (booking confirmation, reminder), Marketing (offers; needs opt-in), Authentication. Add a quick-reply "Stop" button. Meta charges per conversation/message category.
- Template ideas (keep both en and hi): lead acknowledgement; test-drive confirmed; reminder 2 h before; service booking confirmed; "your quote is ready". No discount or price claims in free-text replies (contract rule).
- Mock adapter should store `template_key`, `lang`, `variables` and `status`, and refuse to send if opted out.

### Hindi UI tips
- Use Noto Sans Devanagari in the fallback stack with line-height of 1.6 or more; Devanagari glyphs need more vertical room.
- Allow about 20-30% more text width; do not use fixed-width buttons or letter-spacing on Hindi.
- Use common bilingual terms (EMI, FASTag, test drive can stay in Latin or Devanagari transliteration); keep the Indian numeral grouping and the rupee symbol.
- Do not machine-translate legal text without review.

### SEO
- JSON-LD: AutoDealer (with `address`, `geo`, `openingHoursSpecification`, `telephone`, `areaServed`) on home/contact and per showroom; `Car` (or `Vehicle`) with `vehicleModelDate`, `mileageFromOdometer`, `fuelType`, `vehicleTransmission`, `itemCondition` (UsedCondition) and an `Offer` (`price`, `priceCurrency: INR`, `availability`, `priceValidUntil`) per used car; `BreadcrumbList` everywhere. Only include data visible on the page. Never put the full registration number in markup.
- Used-car URLs: `/used-cars/uc-1182-model-c-vx-2022` (stable ID first, so slug changes never break links). Keep sold cars live with a "Sold - see similar" block and a 200 status for a while, then 301 to the listing.
- Add city landing pages such as `/new-cars/model-h/on-road-price-lucknow` (unique copy and the SSR breakup), which is how CarWale/CarDekho win "on road price in <city>" queries.
- Sitemap with `lastmod`, canonical on filter URLs (index only the first level), `noindex` on staff pages, and hreflang for en/hi.

## D. Mobile CTA patterns summary
Sticky bottom bar (price + primary CTA), floating WhatsApp button that does not cover the bar, tap-to-call in the header, form steps no more than 3, large tap targets, number keypad (`inputmode=numeric`, `autocomplete=tel`) for phone, and a success screen with the consultant's name.

## E. Suggested sequencing for the 8-week scope
Weeks 1-2: ideas 1, 5, 8, 11 (price engine, booking integrity, consent, i18n). Weeks 3-4: 2, 4, 6, 7. Weeks 5-6: 3, 9, 13. Weeks 7-8: 10, 12, 14, 15 and QA. Realistic risk: rates and rules above change; the admin-editable price table and (verify) tags are the mitigation.
