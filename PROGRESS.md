# Progress Log

Roles: Manager, Researcher, Backend Dev, Frontend Dev, Tester, Image sourcing/fix. Target: tester score > 85/100.

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Project setup, contract, run.bat, repo | Manager | done |
| 2 | Research (docs/RESEARCH.md) | Researcher | done |
| 3 | Backend: DB, services, API, AI, tests | Backend | done |
| 4 | Frontend: DriveX-style red/black/white UI, SSR pages, staff/admin | Frontend | done |
| 5 | QA R1 79 -> fixes -> QA R2 **91** | Tester | done |
| 6 | Auth/RBAC v2 (server sessions, 10 roles, customer OTP accounts, exec/desk/service boards) | Backend + Frontend | done |
| 7 | Real photos (Wikimedia Commons, CC), plate masking, credits page | Image agents | done |
| 8 | Premium redesign (cinematic hero, story, tilt, compare, responsive images) | Frontend | done |
| 9 | QA R3 79 -> fixes -> QA R4 **87** (0 critical, 2 major, 5 minor) | Tester | done |
| 10 | R4 fixes: prod bootstrap admin, offer price-permission hole, a11y dialogs, used photos, Hindi | Backend + Frontend | done |
| 11 | UI/UX overhaul v2 (night hero, rail, budget slider, matcher, waterfall, booking tickets, fonts, motion) + skill installed (.claude/skills/ui-ux-pro-max) | Frontend + Researcher | done |
| 12 | QA R5 84 -> R6 84 -> fixes -> QA R7 **88** (0 major, 2 minor, 2 info) | Tester | done |

## Open items
- R5-02 (minor): TBT under 4x CPU stress still high (home 390 ~520 ms, model ~2 s); primary 4G metric met (LCP <= 1.5 s on Fast 4G). Cause not isolated.
- R5-14 (minor, assets): stock photos show other makers' badges/booth signs; replace with official Brand X press images + the yard's own photos.
- R7-01/R7-02 (info): ~120 px empty band on mobile home; desktop home LCP 5.5 s on Slow 4G.
- R4-01: origin history still contains unmasked plate photos + a restricted-licence photo (commit b733cf3); needs history rewrite + force-push (awaiting owner decision).
- N-02: Dockerfile not built (no Docker on dev machine).
- Uncommitted by choice: package.json (motion dep) / package-lock.json - owner to decide.
