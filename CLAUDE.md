# Company A Motors – project notes for Claude

Node 22, no npm dependencies, server-rendered pages. Read README.md and docs/CONTRACT.md before changing anything.

## UI work: use the ui-ux-pro-max skill
For ANY task that changes how something looks, feels, moves or is interacted with (pages, components, layout, colour, typography, animation, accessibility, forms, charts, responsive behaviour, design reviews), invoke the `ui-ux-pro-max` skill first and follow its workflow (design-system search, then domain/stack searches, then pre-delivery checklist). Skip it for pure backend/API/database work.
The skill's files live in `skill/ui-ux-pro-max/` (a junction at `.claude/skills/ui-ux-pro-max` makes it auto-discoverable). Its search tool is `python skill/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`.
Project constraints that always win over generic suggestions: premium-showroom minimalism, white/black with ONE red accent, Hindi + English, 44px touch targets, WCAG AA, vanilla JS (no frameworks/CDNs), pages < 2.5 s on 4G.

## Git
Commit and push as the configured git user only. Never add Claude attribution lines (no Co-Authored-By, no "Generated with" footers) to commits or PR text.
