# Fieldio Full-Stack Module Audit + Competitive Gap Analysis
**Date:** 2026-07-15
**Scope:** Every backend module (46) + every frontend page (44), technician console, dashboards, head-to-head vs ServCraft, plus feature gaps vs ServiceTitan / Jobber / Housecall Pro / SimPRO.
**Method:** Code-verified — every claim below was checked against routes, RBAC, and rendered pages, not assumed from docs.

---

## 1. Executive verdict

**The ServCraft core loop is now won.** Both P0 gaps from the 2026-06-18 audit are closed and code-verified:

- **Field quoting** — `POST /finance/estimates/field` open to `TECHNICIAN`; `use-field-quote.ts` runs through the offline queue, hides prices from techs (server prices it), and auto-sends the customer an approval link.
- **Customer quote approval** — `POST /public/portal/:token/estimates/:id/approve|decline` public endpoints + approve/decline buttons live in the portal UI; `estimates.service.ts` auto-generates the portal link on quote send.
- Also verified: en-route SMS fires on status change (`notifyCustomer('JOB_EN_ROUTE')`), job summary PDF service exists and is sendable from the tech closeout tab, global search is real (debounced, wired to `GET /search`), schedule page now has a tech availability roster (FREE / EN_ROUTE / ON_SITE / BUSY / OFFLINE), automated Google review requests run on a scheduler.

**The new #1 gap is internal, and it's ironic: technicians can quote but the office can't.** There is no back-office estimates page anywhere. `estimate-options-panel.tsx` is imported by nothing, the job detail page has zero quote UI, and nav has no Quotes link. Estimate CRUD, approval, options, and conversion exist only as API endpoints. A dispatcher or office manager who takes a phone enquiry cannot produce a quote from the web app.

**The #2 structural gap:** invoices have no index page — nav's "Invoices" points at `/invoices/overdue`. No browse-all, no filter by status/customer/date, no create-invoice UI outside the job page.

---

## 2. Core loop vs ServCraft — updated scorecard

| Loop stage | ServCraft | Fieldio (2026-07-15) | Winner |
|---|---|---|---|
| Lead capture & comms | Yes | Leads + calls + inbox + bookings + campaigns | **Fieldio** |
| On-site quoting (tech) | Yes | **Yes** — offline-capable, price-hidden, auto approval link | **Tie → Fieldio** (offline) |
| Customer quote approval | Yes (flagship) | **Yes** — portal approve/decline, public token endpoints | **Tie** |
| Job cards / checklists / photos | Yes | Yes + CoC gating, signature enforcement, live timer | Fieldio |
| On-site invoicing | Yes | Office-only invoicing (see gap G-4) | **ServCraft** |
| Customer payment | Yes | PayFast + EFT + financing + public pay page | Fieldio |
| Accounting (Sage/Xero/QB) | Live integrations | One-way Sage CSV export (4 exports) | ServCraft (sync) |
| Dispatch | Basic | Drag-drop, wall-board, availability roster, vans/crews | **Fieldio** |
| Offline | Not marketed | SW + idb queue + resumable mutations incl. quotes | **Fieldio** |
| Breadth | Limited | Memberships, dunning, warranties, permits, projects, subcontractors… | **Fieldio** |

**Remaining ServCraft-relative weaknesses:** on-site invoicing by the tech, and live two-way accounting sync vs our one-way CSV export.

---

## 3. Module-by-module audit

Legend: ✅ solid · 🟡 works but thin/embedded-only · ❌ backend exists, no usable frontend

### Sales & customer-facing
| Module | Backend | Frontend | Notes |
|---|---|---|---|
| Leads | ✅ | ✅ `/leads` | Still buttons, not drag Kanban (minor) |
| Bookings | ✅ (+public) | ✅ | Public `/book/[companyId]` live |
| Calls | ✅ (+public) | 🟡 59-line page | Caller-ID popup thin; no call outcomes/recording notes |
| Inbox / messaging | ✅ (+public) | ✅ | |
| Campaigns | ✅ | ✅ | |
| **Estimates** | ✅ full CRUD, options, approve, convert | ❌ **no office UI at all** | `estimate-options-panel.tsx` orphaned; no nav link; no pipeline view. **G-1** |
| Customers | ✅ + bulk CSV import | ✅ (+ import page) | Properties embedded in customer pages ✅ |
| Reviews | ✅ scheduler → Google review requests | 🟡 settings-only | No dashboard of requests sent / review outcomes |
| Portal (public) | ✅ | ✅ | Jobs, invoices, estimates w/ approve/decline |

### Finance
| Module | Backend | Frontend | Notes |
|---|---|---|---|
| **Invoices** | ✅ | ❌ only `/invoices/overdue` | No index/browse/create page. **G-2** |
| Payments | ✅ PayFast/EFT/Stripe webhook | 🟡 per-invoice only | **No bulk payment recording** for cleared EFT batches. **G-3** |
| Statements | ✅ | ✅ | |
| Credit notes | ✅ | ✅ | |
| Dunning | ✅ | ✅ | |
| Financing | ✅ | ✅ | |
| Sage export | ✅ 4 CSV exports | ✅ on `/reports` | One-way; **no reconciliation view**. **G-5** |
| Expenses | ✅ | 🟡 job-detail + tech view only | No company-wide expense ledger/approval queue |
| Markup rules / flat rate / price book | ✅ | ✅ | Price book has bulk create (admin) |

### Operations
| Module | Backend | Frontend | Notes |
|---|---|---|---|
| Jobs | ✅ rich (1,190-line detail page) | ✅ | Templates, quick-create, photos, docs, expenses, permits |
| Scheduling / dispatch | ✅ | ✅ 791-line board | Drag-drop, wall-board, availability roster. **No route optimization. G-6** |
| Vans / crews | ✅ | ✅ + tech "My Van" stock | |
| Inventory (+alerts, transfers) | ✅ | ✅ | |
| Suppliers + POs | ✅ | ✅ (POs embedded in suppliers) | |
| Subcontractors, permits, warranty claims, certifications | ✅ | ✅ | |
| Projects | ✅ | ✅ | |
| Time tracking | ✅ | ✅ | Timer auto-tied to job status via actualStart/actualEnd ✅ |
| Recurring / memberships | ✅ | ✅ | |
| Digital forms + CoC | ✅ per-user `canIssueCoC`, `requiresCoc` enforced in submitForm | ✅ 549-line page; CoC gating in tech checklist/closeout | |
| Tracking (GPS) | ✅ (+public `/track/[token]`) | ✅ | |

### Platform
| Module | Backend | Frontend | Notes |
|---|---|---|---|
| Auth / users / RBAC | ✅ 7 roles, per-user permissions JSON | ✅ | Role-scoped nav + mobile nav ✅ |
| Company / branches | ✅ | ✅ settings | Branches API exists; no branch-switcher UI verified |
| Analytics | ✅ | 🟡 KPI + reports pages | See §5 |
| Search | ✅ | ✅ | Debounced global quick-search, wired |
| Documents | ✅ | 🟡 embedded in job detail | No document library page |
| Offline | ✅ | ✅ | SW, idb queue, persisted RQ cache, reconnect-auth |

---

## 4. Technician console deep-dive

**Current state (strong):** thin 225-line orchestrator over 24 focused modules. Work/Media/Done tabs; one-tap status flow; checklist + signature gating on completion; live job timer frozen at actualEnd; price-book line items and field quotes with prices hidden (server-priced); expenses capture; photos w/ captions; notes; CoC gating; job summary PDF send at closeout; everything offline-queued; 30s polling on assigned jobs.

**Gaps vs the best tech apps (ServiceTitan Mobile / Housecall Pro / Jobber):**

1. **No customer/job history on site.** `technician/types.ts` carries no prior-visit or equipment data. ServiceTitan shows techs full service history + installed equipment before they knock. High-value for repeat plumbing customers.
2. **No equipment/asset records anywhere in the app** (no module). SimPRO/ServiceTitan track installed assets (geysers, pumps) with service history and warranty dates — this drives recurring revenue and is a natural fit for the memberships module.
3. **No on-site payment step.** Tech can send a quote but not trigger an invoice or payment link at closeout. Given the hide-pricing rule, the right shape is a "request invoice / send pay link" action that never shows amounts to the tech — office- or server-priced, customer sees the total. ServCraft and HCP both close the money loop on site.
4. **No "running late / delay" one-tap notify** to customer or dispatch.
5. **No turn-by-turn day view** — jobs link to Google Maps individually; there's no ordered route for the day (ties to G-6).
6. **No apprentice competency sign-off** flow (van/crew model exists; lead-signs-off-apprentice does not).
7. Header greets by email prefix (`user.email.split("@")[0]`) — cosmetic, but techs should see their name.

---

## 5. Dashboards deep-dive

**Owner dashboard (`/`)** — 337 lines: revenue/outstanding, jobs, customers, estimate conversion (sent/approved/rate ✅ — the funnel now exists), tech utilization, overdue count, recent jobs, active techs. Good bones.

**KPI page (`/kpi`)** — 108 lines: revenue + delta, avg ticket, close rate, jobs done, AR aging 30/60/90 ✅, membership churn, top techs. Auto-refresh 60s.

**Reports (`/reports`)** — job costing, timesheets, tech earnings + 4 Sage exports; date-ranged. Plus GPS playback page.

**Gaps vs competitor dashboards (this is where "beat them" is cheapest):**

1. **Zero charts.** Every number is a stat card or table. Competitors lead demos with revenue trend lines, job pipeline funnels, and booking heatmaps. One trend chart (revenue by week, jobs by status over time) transforms perceived quality.
2. **Fixed 30-day window on KPI** — no date-range picker, no month-vs-month compare, no branch filter (branches API exists).
3. **No quote pipeline widget** — sent → viewed → approved → converted funnel with values (backend now has all the states; "viewed" needs a portal view-timestamp).
4. **No technician scoreboard page** — revenue per tech exists, but no utilization %, first-time-fix rate, avg job duration, callbacks. ServiceTitan sells owner dashboards on exactly this.
5. **No marketing ROI view** — campaigns exist but no cost-per-lead / revenue-per-campaign rollup.
6. **No dispatcher day-summary strip** on the schedule (jobs unassigned / at-risk SLA / techs idle).
7. **No drill-down** — KPI cards aren't links; clicking "Over 90 days" should open the filtered overdue list.

---

## 6. What comps have that we don't

**ServCraft (the head-to-head):**
- On-site invoicing by the tech (we require office). → G-4
- Live two-way accounting sync (Sage/Xero/QuickBooks); ours is one-way CSV. → G-5

**ServiceTitan:**
- Equipment/asset service history per property.
- Good-better-best presented to customer with photos in the field (we have options in the API; the field quote sends a flat item list).
- Tech scorecards; capacity planning; call-booking performance.

**Jobber / Housecall Pro:**
- Route optimization for the day's jobs. → G-6
- Consumer financing at point of quote (we have a financing module — surface it on the portal quote page: "or from R X/month").
- Online self-serve rescheduling by the customer from the portal.
- Automatic "on my way" text with live ETA countdown (we send tracker link; no ETA).

**SimPRO:**
- Multi-stage project claims/retention invoicing (projects module exists; progress-claim invoicing not verified).
- Supplier catalogue imports with price updates.

**Where we already beat everyone in the SA segment:** offline-first field console (nobody markets this), van/crew dispatch, CoC/permit compliance flow, dunning automation, memberships, SARS zero-stock handling, WhatsApp channel, hide-pricing-from-techs policy control, automated Google review requests.

---

## 7. Prioritized roadmap

### P0 — Finish the money loop end-to-end
1. **G-1: Office estimates page** (`/estimates`): pipeline list (draft/sent/approved/declined/expired), create/edit with multi-option, send-approval-link, convert-to-job. Reuse the orphaned `estimate-options-panel.tsx`. Add "Quotes" to admin/office/sales nav.
2. **G-2: Invoices index** (`/invoices`): all statuses, filters, create standalone invoice; keep `/invoices/overdue` as a filter preset.
3. **G-4: Field closeout money step:** "Send invoice + payment link" action in the tech Done tab — server-priced from job line items, amounts hidden from tech per policy, customer pays via existing `/pay/[token]`.

### P1 — Back-office efficiency + dashboard wow
4. **G-3: Bulk payment recording** (paste/upload EFT batch, match to invoices) + bulk invoice generation for completed-uninvoiced jobs.
5. **G-5: Sage reconciliation view** (exported vs paid vs changed-since-export).
6. **Dashboard charts:** revenue trend, quote funnel, jobs-by-status over time; date-range + compare on KPI; make stat cards drill through to filtered lists.
7. **Tech scoreboard** (utilization, avg duration, first-time-fix, callbacks, revenue).
8. Customer history in the tech console (last 5 jobs at this property + notes).

### P2 — Differentiators
9. **G-6: Route optimization** + ordered day view in tech console with "on my way" ETA.
10. Equipment/asset registry per property (service history, warranty dates) feeding membership renewals.
11. Portal upgrades: financing offer on quote approval page, self-serve reschedule.
12. Apprentice competency sign-off; multi-language (EN/Afrikaans/Zulu) — still an open flank ServCraft ignores.

---

*Supersedes COMPETITIVE_AUDIT_SERVCRAFT_2026-06-18.md. All June-audit P0/P1 items verified: field quoting ✅, portal approval ✅, en-route SMS ✅, job summary PDF ✅, global search ✅, availability roster ✅, AR aging ✅, customer CSV import ✅. Still open from June: bulk invoice/payment ops, Sage reconciliation, route optimization, Kanban leads.*
