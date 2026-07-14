# Fieldio vs ServCraft — Competitive Module Audit
**Date:** 2026-06-18
**Benchmark:** ServCraft (servcraft.co.za) — "South Africa's #1 job management software for plumbers"
**Method:** Walked every module as the 6 Mthembu Plumbing personas would, using ServCraft's marketed workflow as the yardstick.

> ServCraft's whole pitch is narrow and sharp: **capture lead → quote on site → customer approves on their phone → do the job → invoice on site → customer pays → push to Sage/Xero/QuickBooks.** They win on *that loop being frictionless*, not on breadth. Fieldio has ~3× the feature surface (50 API modules, 45 routes, 67 data models) but loses the head-to-head on the exact loop ServCraft markets. This audit is organised around that loop.

---

## TL;DR — the verdict

Fieldio is **broader and more SA-aware** than ServCraft (van/crew dispatch, dunning, memberships, Sage export, RBAC, offline). But ServCraft beats us on the **one flow customers actually buy field-service software for**: getting a quote approved and an invoice paid by the customer, from their own phone, without a phone call.

**The single biggest gap:** there is **no customer-facing quote approval**. ServCraft's #1 selling line — *"customers can approve quotes and invoices directly"* — has no equivalent in Fieldio. Our `approve` endpoint is locked to `ADMIN/OFFICE/DISPATCHER`, the portal only *lists* estimates with no approve button, and there is no public `/estimate/[token]` page at all.

**The second biggest gap:** **technicians cannot quote in the field.** ServCraft markets "quotes generated on site, on the road." Our tech view (`technician-view.tsx`) has no quote/estimate creation, and estimate-create is locked out of the `TECHNICIAN` role. Field upsell is impossible.

Fix those two and Fieldio matches ServCraft's core loop while keeping a large breadth advantage.

---

## What's changed since the 2026-06-12 audit (verified now)

Several prior P0 blockers are **resolved** — credit where due:

| Prior blocker | Status today | Evidence |
|---|---|---|
| No offline mode (empty SW stub) | **Fixed** | Real `sw.js` (network-first nav + SWR), `idb-keyval` queue in `lib/offline-db.ts` + `lib/offline-mutations.ts`, `PersistQueryClientProvider` in `app/providers.tsx` |
| No role-specific nav | **Fixed** | `lib/nav-config.ts` — 7 role-specific sidebars + mobile nav (tech sees 3 groups, not 30 items) |
| No drag-drop dispatch / no reassign | **Fixed** | Commits `7e776af` assign-on-drop + reassign, `2d8dab2` wall-board view |
| No Sage export UI | **Fixed** | 3 export buttons on `/reports` → `/finance/export/sage/{invoices,expenses,job-costing}` |
| Digital Forms page is a stub | **Fixed** | `forms/page.tsx` now 549 lines, wired to API |
| Tech view has 6 tabs on mobile | **Fixed** | Consolidated to 3 (Work / Media / Done) |

So the app is materially ahead of where the last report left it. The gaps below are the *current* ones.

---

## The Core Loop (ServCraft's home turf) — module by module

### 1. Lead capture & customer comms — **PARITY, slight edge to Fieldio**
- ServCraft: multi-channel lead capture, automated email/SMS.
- Fieldio: `/leads` pipeline, `/calls` (caller-ID popup), `/inbox`, `/bookings`, `/campaigns`, SMS + WhatsApp + email services all present.
- **Gap:** Leads pipeline uses buttons, not a drag Kanban (minor). Inbound lead → quote handoff is multi-click vs ServCraft's one flow.

### 2. On-site quoting — **MAJOR GAP** ❌
- ServCraft: tech generates a professional quote on site / on the road; multi-option supported.
- Fieldio: estimates exist (`modules/estimates`, multi-option good-better-best, signature approval) **but**:
  - `POST /finance/estimates` is `restrictTo('ADMIN','OFFICE','DISPATCHER')` — **technicians are excluded.**
  - `technician-view.tsx` has **zero** quote/estimate UI (no grep hits for estimate/quote).
  - A field tech who spots extra work can only add line items to the *invoice* — no customer-approvable quote.
- **Impact:** Sipho (lead plumber) and Nokwanda (solo) cannot upsell on site, which is the exact moment plumbing margin is made. ServCraft wins this outright.

### 3. Customer quote approval — **MAJOR GAP** ❌ (highest priority)
- ServCraft: customer approves the quote directly from their phone — headline feature.
- Fieldio:
  - `POST /finance/estimates/:id/approve` is staff-only (`restrictTo ADMIN/OFFICE/DISPATCHER`); it captures a signer name + signature, i.e. designed for **in-person** sign-off, not remote self-service.
  - Public routes are only `book`, `pay`, `portal`, `track`. **There is no `/estimate/[token]` page.**
  - The customer portal (`portal/[token]`) *lists* estimates (status pill only) with **no approve / accept-option / decline button**.
- **Impact:** Every quote requires a phone call or a site visit to close. This is the loop ServCraft is built to remove. **Fix first.**

### 4. Job execution / job cards — **PARITY** ✅
- ServCraft: digital job cards, checklists, photos & notes, real-time progress + tech location.
- Fieldio: strong here — `technician-view.tsx` 3-tab field UI (Work/Media/Done), checklist + signature enforcement, photo upload w/ captions, price-book search, one-tap status progression, live GPS on dispatch map, CoC/permit gating.
- **Gap:** No PDF job report emailed to customer from the tech view; no "tech en route" auto-SMS confirmed wired to status change (sms.service exists — verify the trigger).

### 5. On-site invoicing — **PARITY** ✅
- ServCraft: invoice in field/office, paid/pending/overdue tracking.
- Fieldio: invoices module, overdue view, statements, credit notes, dunning, line items from job. Strong.
- **Gap:** No bulk invoice generation for completed jobs; no customer *approval* of an invoice (ServCraft offers this — lower value than quote approval).

### 6. Get paid — **PARITY, edge to Fieldio** ✅
- ServCraft: direct invoice payment for customers.
- Fieldio: public `/pay/[token]` page, PayFast + EFT + financing module. Good.
- **Gap:** No bulk payment recording when an EFT batch clears (still one-by-one) — hurts Priya.

### 7. Accounting handoff — **EDGE to Fieldio** ✅
- ServCraft: Sage / QuickBooks / Xero integration.
- Fieldio: Sage export (invoices, expenses, job-costing) live in UI; zero-stock cost-of-sale handling for SARS; VAT configurable.
- **Gap:** Export is CSV-style download, not a live two-way sync; no reconciliation view to match Sage entries back to Fieldio invoices.

---

## Persona walkthroughs (head-to-head feel)

### Owen — Owner/Admin
Wins: full breadth, KPI + reports, Sage export, dunning automation. **Lacks vs ServCraft:** can't see quote-approval conversion as a funnel because the customer-approval step doesn't exist; global top-bar search box is **decorative** (no handler) — looks broken on day one.

### Zanele — Dispatcher
Strong now: drag-drop assign-on-drop, reassign, wall-board fullscreen view. **Lacks:** tech availability "who's free" glance; route optimisation for the day's queue (ServCraft markets smart job-card tracking + location).

### Sipho — Lead Plumber / Van Driver
Good field job-card UX. **Lacks:** on-site quoting (can't upsell), no PDF/summary send to customer from field, no offline-created *quote* (offline queue covers status/photos/line-items, not quotes since the feature is absent).

### Thabo — Apprentice
Role nav now trims correctly. **Lacks:** competency sign-off by lead; auto-timer tied to job status (time tracking still separate from job flow — verify).

### Nokwanda — Solo Plumber
The persona ServCraft targets hardest (one-person shop = quote→approve→pay must be self-service). **Lacks:** the entire remote quote-approval loop. She is the persona most likely to choose ServCraft over Fieldio today.

### Priya — Office Manager / Accountant
Sage export ✅. **Lacks:** bulk invoice gen, bulk payment recording, bulk customer CSV import, aging report (30/60/90), Sage reconciliation view.

---

## Prioritised roadmap to beat ServCraft head-to-head

### P0 — Close the core-loop gaps (this is the whole ballgame)
1. **Public customer quote-approval page** `/estimate/[token]`: view options, accept option, approve w/ signature, decline — mobile-first. Open the approve/accept endpoints to a token-authenticated customer path (not staff RBAC). Add approve/decline buttons to the portal estimates tab too.
2. **Field quoting for technicians**: add estimate creation to `technician-view.tsx`; allow `TECHNICIAN` on `POST /finance/estimates` (price-book driven, hide cost/margin per existing tech-pricing rule). Auto-send the approval link by SMS/WhatsApp on save.
3. **Auto "quote sent" + "tech en route" SMS/WhatsApp** tied to status changes (services exist — wire the triggers).

### P1 — Match the polish ServCraft sells on
4. Customer invoice approval/acknowledgement on the pay page.
5. PDF job summary emailed/WhatsApp'd to customer from the field on closeout.
6. Bulk ops for Priya: invoice generation, payment recording, customer CSV import.
7. Aging report (30/60/90) + Sage reconciliation view.
8. Make the global search box real (Cmd+K quick search across jobs/customers/invoices).

### P2 — Extend the breadth lead
9. Route optimisation + tech availability board for Zanele.
10. Leads drag-drop Kanban; competency sign-off for apprentices; auto-timer on status.
11. Multi-language (English/Afrikaans/Zulu) — ServCraft doesn't emphasise this; could be a differentiator.

---

## Scorecard vs ServCraft

| Loop stage | ServCraft | Fieldio | Winner |
|---|---|---|---|
| Lead capture & comms | Yes | Yes (+campaigns, calls, inbox) | Fieldio |
| On-site quoting (tech) | Yes | **No** | **ServCraft** |
| Customer quote approval | Yes (flagship) | **No** | **ServCraft** |
| Job cards / checklists / photos | Yes | Yes (CoC, permits, signature) | Tie |
| On-site invoicing | Yes | Yes | Tie |
| Customer payment | Yes | Yes (PayFast/EFT/financing) | Fieldio |
| Accounting (Sage/Xero/QB) | Integrations | Sage export + SARS zero-stock | Tie/Fieldio |
| Dispatch | Basic | Van/crew + drag-drop + wall-board | **Fieldio** |
| Offline | Not marketed | Real (SW + idb queue) | **Fieldio** |
| Breadth (memberships, dunning, warranties, permits, projects) | Limited | Extensive | **Fieldio** |

**Bottom line:** Fieldio loses today only where ServCraft is laser-focused — customer-facing quote approval and field quoting. Both are buildable on existing infrastructure (estimates module + portal token pattern + tech view already exist). Ship P0 and Fieldio is strictly ahead.
