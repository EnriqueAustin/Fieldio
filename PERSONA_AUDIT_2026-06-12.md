# Fieldio Plumbing Persona Audit
**Date:** 2026-06-12
**Overall Score:** 67/100
**Blockers:** 19 | Gaps: 38 | Wins: 27

---

## Personas

### 1. Owen Mthembu — Owner/Admin (Score: 72/100)
12-person Cape Town plumbing company. Needs financial oversight, KPI tracking, Sage integration.

### 2. Zanele Nkosi — Dispatcher (Score: 65/100)
Manages daily dispatch for 3 vans. Needs drag-drop scheduling, emergency re-routing.

### 3. Sipho Dlamini — Lead Plumber / Van Driver (Score: 70/100)
Drives Van 1, leads 3-person crew. Phone-only. Needs one-tap job progression, offline capability.

### 4. Thabo Moyo — Van Member / Apprentice (Score: 62/100)
Junior plumber. Limited access. Needs to see assignments, check off work, log time.

### 5. Nokwanda Zulu — Solo Plumber (Score: 68/100)
Independent tech. Needs fast job-to-invoice flow, customer communication, receipt capture.

### 6. Priya Naidoo — Office Manager / Accountant (Score: 63/100)
Handles invoicing, AR, Sage reconciliation. Desktop user. Needs efficient bulk operations.

---

## BLOCKERS (19 total) — Must fix before launch

### Offline & Mobile (3 blockers — affects Sipho, Thabo, Nokwanda)
1. **No offline mode at all** — all actions require live API calls. Service worker is an empty stub. Techs in basements, rural areas, or during load shedding lose all functionality.
2. **Photo upload fails silently on weak signal** — no retry queue, no local cache. Techs take photos that never reach the server.
3. **App loads full dashboard for all roles** — no role-specific view trimming. A technician sees 30+ nav items they can't use, on a phone.

### Dispatch & Scheduling (3 blockers — affects Zanele)
4. **No drag-and-drop** from unscheduled jobs panel to calendar — must click through forms to schedule each job.
5. **No job re-assignment** from dispatch view — can't move a job from one tech/van to another without canceling and recreating.
6. **No tech availability view** — dispatcher can't see who's free vs busy vs on break at a glance.

### Finance & Accounting (6 blockers — affects Owen, Priya)
7. **No Sage export UI** — API endpoint exists at /api/sage-export but no button/flow in the frontend.
8. **No Sage reconciliation view** — can't match Sage entries to Fieldio invoices.
9. **No aging report (30/60/90 days)** — overdue page exists but no time-based breakdown.
10. **Credit notes can't be applied** to future invoices from the UI.
11. **No bulk invoice generation** for completed jobs.
12. **No bulk payment recording** — when an EFT batch clears, must record each payment individually.

### Bulk Operations (3 blockers — affects Priya)
13. **No bulk customer import/export** (CSV) — every customer entered manually.
14. **No batch statement emails** for overdue accounts.
15. **No bulk reminder send** from overdue invoices page.

### Technician Experience (2 blockers — affects Thabo)
16. **No auto-timer** tied to job status changes — time tracking is completely separate from job flow.
17. **No training/competency sign-off** system for apprentices by lead plumber.

### Communication (2 blockers — affects Nokwanda)
18. **No automated "tech en route" SMS** to customer when job status changes to EN_ROUTE.
19. **Digital forms page is non-functional** — hardcoded "Loading..." with no API calls.

---

## GAPS (38 total) — Should fix for competitive parity

### Frontend Architecture Gaps
- Job detail page is 1,188 lines — should be split into sub-routes or lazy-loaded components
- Schedule page is 576 lines with map, calendar, vans, recurring plans all in one view
- Settings company page has 40+ fields in one scroll — needs tabs or wizard
- Inconsistent data fetching: some pages use React Query, others use raw useEffect+useState
- Status enum strings hardcoded in 6+ places — should be shared constants
- No error boundaries except on dashboard
- No pagination on list pages (customers, jobs, leads)

### Mobile UX Gaps
- Tech view has 6 tabs on mobile (Checklist, Items, Expenses, Notes, Photos, Closeout) — too many
- Line item form uses 4-column grid — unusable on phone
- Schedule page has fixed 620-820px heights — breaks on mobile
- Dispatch map in fixed container — not responsive
- 30-second polling intervals drain battery on older phones
- Job detail fetches 4 endpoints simultaneously — slow on weak signal

### Missing Features (competitive gaps vs ServiceTitan/Jobber/Housecall Pro)
- No route optimization for daily job queue
- No keyboard shortcuts or Cmd+K quick search
- No "duplicate job" for recurring work at same address
- No customer merge for duplicates
- No tech performance comparison (completion speed, average ticket)
- No mileage/fuel tracking
- No quick-reply templates for messaging
- No automated review request after job completion
- No auto-inventory deduction when line items added to job
- No barcode scanning for inventory
- No customer email/SMS of completed job summary from tech view
- No PDF job report generation from tech view
- Leads pipeline uses buttons instead of drag-drop Kanban
- No form auto-save — losing tab loses work
- No reduced-data mode for EDGE/2G

### Incomplete Implementations
- Projects detail page uses hardcoded mock data — not wired to API
- Digital Forms page is a complete stub — empty tables with no functionality
- Calls page (59 lines) has no filtering, sorting, or pagination
- Reports page has no date range picker (hardcoded 30 days)
- Receipt photo in expense form captured but not actually sent to API
- Customer detail page (150 lines) is sparse — missing property/asset view
- Van inventory targets in schema but no threshold alerts on mobile

---

## WINS (27 total) — What's working well

### Strong Foundations
- Van/crew dispatch model (van → members → jobs) is correct for SA market
- 7-role RBAC system covers all org chart positions
- VAT, EFT, PayFast, WhatsApp, Xero all configurable in settings
- Sage export API endpoint exists (just needs UI)
- Real-time WebSocket for dispatch map GPS pings

### Good Technician UX
- "Up next" card with customer, time, address — clear priority
- One-button status progression: Start route → Arrive → Complete
- Price book search for field line item entry
- Signature pad with canvas touch drawing
- Checklist + signature enforcement before job completion
- Photo upload with captions

### Solid Business Features
- Dunning automation for overdue follow-up
- Multi-option estimates for good-better-best quoting
- Customer portal (booking, tracking, payment)
- Recurring maintenance plan scheduling
- Membership tiers with auto-renewal

### Clean UI Patterns
- Consistent color-coded status pills across all pages
- Stat cards with icons on dashboard/schedule/inventory
- Filter chips + search on job board and bookings
- Stepper for job status progression

---

## COMPETITIVE COMPARISON

| Feature | Fieldio | ServiceTitan | Housecall Pro | Jobber |
|---------|---------|-------------|---------------|--------|
| Drag-drop dispatch | No | Yes | Yes | Yes |
| Offline mode | No | Partial | Yes | Yes |
| Route optimization | No | Yes | No | Yes |
| Flat-rate pricing | Yes | Yes | Yes | No |
| Multi-option estimates | Yes | Yes | Yes | Yes |
| Automated dunning | Yes | Yes | No | No |
| Van/crew dispatch | Yes | No | No | No |
| Sage integration | Partial | No | No | No |
| Customer portal | Yes | Yes | Yes | Yes |
| Technician mobile UX | Good | Fair | Excellent | Excellent |
| Bulk operations | No | Yes | Partial | Yes |
| Time tracking | Basic | Advanced | Basic | Advanced |
| Inventory mgmt | Good | Advanced | Basic | Basic |

**Fieldio's competitive edge:** Van/crew dispatch model and SA-market focus (Sage, VAT, EFT, PayFast).
**Fieldio's biggest gap:** Offline capability and mobile performance — this is table stakes for field service.

---

## PRIORITY ROADMAP

### P0 — Ship blockers (fix before any customer uses this)
1. Offline mode with local cache + sync queue (photos, status changes, time entries)
2. Role-specific navigation trimming (techs see 6 items, not 30)
3. Drag-drop dispatch on schedule page
4. Sage export UI button
5. Automated "tech en route" SMS

### P1 — Competitive parity (fix within first month)
6. Bulk operations: invoice generation, payment recording, customer import
7. Job re-assignment from dispatch
8. Aging report (30/60/90)
9. Wire up Projects detail and Digital Forms pages
10. Auto-timer tied to job status changes

### P2 — Polish & efficiency (next quarter)
11. Split large pages (Jobs detail, Schedule, Settings)
12. Standardize React Query usage everywhere
13. Add Cmd+K quick search
14. Route optimization
15. Keyboard shortcuts for power users
16. Pagination on all list pages

### P3 — Differentiation (future)
17. AI-powered tech suggestion (match skills, proximity, load)
18. Customer satisfaction tracking post-job
19. Barcode scanning for inventory
20. Multi-language support (English, Afrikaans, Zulu)
