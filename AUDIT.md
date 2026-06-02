# Fieldio — Competitive Audit
**Date:** 2026-06-02 | **Scope:** Global FSM market + South African market

---

## 1. What Fieldio Is

Fieldio is a **multi-tenant Field Service Management (FSM) SaaS** built for trade businesses (plumbing-first, expandable to HVAC, electrical, landscaping). It is a web-first/PWA product targeting the South African market (ZAR currency, SARS-adjacent requirements). The current stack is Next.js 15 + Express + Prisma + PostgreSQL.

---

## 2. Competitive Landscape

### 2.1 Global Tier-1 Competitors

| Product | Market | Pricing (USD/mo) | Core Strength | SA Presence |
|---|---|---|---|---|
| **ServiceTitan** | US enterprise | $200–500+/tech | Gold-standard dispatch, deep integrations | None |
| **Jobber** | US/CA SMB | $49–249 | Clean UX, CRM-first, best in class quoting | Limited |
| **Housecall Pro** | US residential | $49–199 | Consumer-grade UX, review automation | None |
| **FieldEdge** | US HVAC/plumbing | $100–300/tech | QuickBooks-native, flat-rate pricing | None |
| **Zuper** | Global | $35–80/user | Modern UI, strong mobile, good API | Some |
| **ServiceMax** | Enterprise | $150+/user | Asset/equipment lifecycle | None |

### 2.2 APAC/SA-Adjacent Competitors (Real Threats)

| Product | Market | Pricing | Core Strength | SA Presence |
|---|---|---|---|---|
| **Simpro** | AU/NZ/UK/SA | ~$50–100/user | SA offices, multi-trade, strong compliance | **Active SA office** |
| **ServiceM8** | AU/NZ/SA | $29–349/mo flat | Simplicity, native mobile, offline | **Growing SA use** |
| **WorkflowMax** (Xero) | AU/NZ/SA | $45+/user | Xero-native, popular in SA accounting | **Xero = SA default** |
| **Fergus** | AU/NZ | $25–60/user | Job costing, supplier POs, quotes | Some SA adoption |

### 2.3 South Africa Specific

| Product | Notes |
|---|---|
| **iFieldSmart** | Homegrown SA FSM, basic feature set, less polished |
| **FieldEquip** | SA-used IoT/field ops, heavier enterprise |
| **Various WhatsApp-based tools** | Many SA trades run job tracking via WhatsApp Business — this is the real competition at the low end |
| **Pen-and-paper / Excel** | Still the dominant "tool" for small SA trade businesses — Fieldio's real conversion target |

---

## 3. Fieldio Feature Audit

### 3.1 What's Built (Confirmed in Code)

| Feature | Status | Quality Notes |
|---|---|---|
| Multi-tenant auth (JWT, RBAC) | ✅ Built | Solid. 4 roles: ADMIN, DISPATCHER, OFFICE, TECHNICIAN |
| Customer & Property CRM | ✅ Built | Basic. No equipment/asset history per customer |
| Job lifecycle management | ✅ Built | Full flow: REQUESTED → ASSIGNED → EN_ROUTE → ON_SITE → COMPLETED |
| Dispatch calendar (FullCalendar) | ✅ Built | Drag-and-drop schedule + dispatch map |
| Live technician GPS map | ✅ Built | Socket.io pings, stale pin detection |
| Estimates | ✅ Built | Draft/Sent/Approved/Declined flow |
| Invoices | ✅ Built | Full lifecycle, overdue tracking |
| Stripe online payments | ✅ Built | Payment portal, webhook handler |
| Job checklist (per job) | ✅ Built | Completion required before job close |
| Job photos upload | ✅ Built | S3-backed, captions, thumbnail |
| Customer e-signature capture | ✅ Built | Canvas-based, saved as data URL |
| Internal job notes | ✅ Built | Stored in AuditLog, real-time emit |
| Inventory management | ✅ Built | Warehouse/Van locations, min-level alerts |
| Recurring jobs | ✅ Built | Scheduler service wired |
| Expense tracking | ✅ Built | Controller + service present |
| Customer booking portal | ✅ Built | Public `/book/[companyId]` route |
| Online payment portal | ✅ Built | Public `/pay/[token]` route |
| Analytics dashboard | ✅ Built | Revenue, jobs, utilization, conversion rate |
| Email notifications | ✅ Built | Resend integration |
| SMS notifications | ✅ Built | Twilio integration |
| Audit log | ✅ Built | All key actions captured |
| Real-time (Socket.io) | ✅ Built | Company-scoped rooms |
| Business hours settings | ✅ Built | Settings page |
| Price book | ✅ Built | Settings page |
| User management | ✅ Built | Invite/manage users |
| Rate limiting + Helmet | ✅ Built | Auth limiter + API limiter |

---

### 3.2 What's Missing vs Competitors — Prioritised

#### CRITICAL (Blocking revenue / market entry)

| Gap | Why Critical | Competitor Benchmark |
|---|---|---|
| **No native mobile app** | SA technicians use smartphones (often Android), not laptops in the field. PWA is not enough — push notifications, camera access, offline all degrade. | Jobber, Housecall Pro, ServiceM8 all have native iOS + Android |
| **No WhatsApp integration** | WhatsApp is the primary communication channel for SA trade businesses. Customers expect job updates on WhatsApp, not email. Email open rates in SA trades are very low. | Simpro SA customers request this constantly. No competitor does it well — first-mover advantage |
| **No local SA payment gateway** | Stripe card payments have low adoption among SA small business clients. EFT (bank transfer) is the dominant payment method. PayFast and Peach Payments are the SA standards. | Simpro SA uses local gateway options |
| **No VAT/SARS compliance** | SA businesses must issue VAT-compliant invoices (VAT number on invoice, correct VAT line, correct formatting per SARS requirements). Currently missing from invoice module. | Simpro, WorkflowMax handle this |
| **No Xero integration** | Xero is the dominant accounting platform in SA (more so than QuickBooks). Without this, bookkeepers won't recommend Fieldio. | WorkflowMax is literally built by Xero. Simpro has deep Xero sync. |

#### HIGH (Significant competitive disadvantage)

| Gap | Why Important | Competitor Benchmark |
|---|---|---|
| **No offline mode** | SA has unreliable connectivity AND load shedding (scheduled power cuts 2–8hrs/day). Technicians lose signal regularly. | ServiceM8 has strong offline-first design |
| **No equipment/asset tracking per customer** | Plumbers need to know the geyser model, install date, service history at each property. This drives repeat business and upsells. | ServiceTitan, FieldEdge excel here |
| **No customer-facing portal** | Customers can't log in to see job history, invoices, approve quotes. Self-service reduces inbound calls. | Jobber has a client hub, Housecall Pro has customer app |
| **No flat-rate / price book integration at job level** | Technicians in the field need to select from a pricebook quickly. Currently price book exists in settings but isn't wired into job line items. | FieldEdge built its entire identity on flat-rate pricing |
| **No route optimisation** | Dispatchers waste time manually ordering jobs. Multi-stop route optimisation saves fuel and fits more jobs per tech per day. | Housecall Pro, Jobber offer this |
| **No technician commission / payroll export** | SA contractors are often paid per job. No way to calculate tech earnings or export payroll data. | ServiceTitan has full payroll integration |
| **No review/feedback automation** | After a completed job, no automated request for Google review. Reviews are the #1 growth driver for trade businesses. | Housecall Pro, Jobber both have review request automation |
| **No purchase orders / supplier management** | Plumbers buy materials from suppliers (Builders Warehouse, Leroy Merlin, etc.). No PO workflow to track material costs against jobs. | Simpro, Fergus both strong here |

#### MEDIUM (Polish / retention gaps)

| Gap | Notes |
|---|---|
| **No time tracking / timesheet** | actualStart/End is tracked but there's no timesheet view, no tech hours report |
| **No job costing report** | Labour + materials vs invoice amount — critical for profitability tracking |
| **Estimates → Jobs conversion is unclear** | Is there a 1-click "convert estimate to job" flow? Not confirmed in code. |
| **No bulk SMS / marketing** | Mass-message customers for seasonal offers (geyser service before winter, etc.) |
| **No franchise / multi-branch support** | If a plumbing company has 3 branches, they can't manage separately within one account |
| **No dark mode** | Minor but notable — many competitors offer it |
| **Signature stored as data URL** | Storing base64 in DB is expensive and slow. Should be uploaded to S3 and stored as URL. |
| **No quoting approval flow with customer signature** | Estimates can be approved internally but no customer e-sign on quote |
| **No call-to-action in customer notifications** | EN_ROUTE email/SMS should include a tracking link — currently just notifies |
| **Dashboard uses email as display name** | `user.email.split("@")[0]` is not a name. No `name` field on User model. |

#### SOUTH AFRICA SPECIFIC GAPS

| Gap | SA Context |
|---|---|
| **Load shedding mode** | When power goes out, routers go down. App needs IndexedDB caching + graceful offline degradation |
| **WhatsApp Business API** | 90%+ of SA population uses WhatsApp daily. Job confirmations, ETA updates, and invoices over WhatsApp |
| **SARS e-invoicing / tax compliance** | VAT invoice must contain: VAT reg number, "Tax Invoice" heading, VAT amount, correct total breakdowns |
| **PayFast / Peach Payments** | Local payment gateways trusted by SA consumers. Stripe debit card support is limited in SA. |
| **Afrikaans / isiZulu localisation** | Not required immediately but noted for tier-2 markets |
| **ID number / company reg capture** | SA B2B clients often require supplier registration numbers on invoices |
| **Electricity / water municipal data** | Integration with city APIs to cross-ref property data — future differentiator |

---

## 4. Code Quality & Technical Gaps

| Area | Issue | Risk |
|---|---|---|
| **Signature storage** | `signatureDataUrl` is base64 stored in DB — will bloat fast | High |
| **No pagination on most admin queries** | `/customers`, `/users` likely return all records | Medium |
| **`as any` casts in jobs.service.ts** | `status: status as any` — type safety bypassed | Medium |
| **User model has no `name` field** | Email used as display name everywhere | Medium |
| **No test suite** | Zero tests visible in codebase | High (trust / stability) |
| **No CI/CD pipeline** | No GitHub Actions / Vercel preview deploys found | Medium |
| **No staging environment config** | Only `dev` and `prod` in env | Medium |
| **BullMQ imported but unclear usage** | Queue infra planned but workers not confirmed | Low |
| **Estimate `APPOVED` typo in schema** | `APPOVED` instead of `APPROVED` | Low (but embarrassing) |
| **No soft-delete on any model** | Deleting a customer orphans jobs/invoices | Medium |

---

## 5. Market Positioning Assessment

### Current Position
Fieldio is **more complete than most people would expect at this stage** — the core FSM loop (book → dispatch → field → invoice → pay) is functional. It is ahead of iFieldSmart and most local SA options on raw feature depth.

### Gap to Win Against
The gap to be taken seriously by SA SMB trade businesses is not features — it's **trust and integration**:
1. They will ask: "Does it do Xero?" — No.
2. They will ask: "Can I get paid by EFT?" — Not yet.
3. Their admin will ask: "Is the invoice SARS-compliant?" — Not yet.
4. Their technician will ask: "Does it work on my phone?" — Partially (PWA only).

### Competitive Moat Opportunity
The **SA-specific moat** that no global competitor has properly built:
- **WhatsApp-native job notifications** (book via WhatsApp, get ETA updates on WhatsApp, pay via WhatsApp)
- **Load-shedding-resilient offline mode**
- **PayFast + EFT payment integration**
- **SARS VAT-compliant invoicing out of the box**

---

## 6. Build Priority Recommendation

### Phase 1 — "Market Entry Blockers" (Build these first)
1. VAT-compliant invoice formatting (SARS requirements)
2. PayFast payment gateway integration
3. Xero accounting sync (basic: invoices + contacts)
4. User `name` field + proper profile setup
5. Fix: signature → upload to S3, store URL not base64

### Phase 2 — "Trust Builders"
1. Native Android PWA push notifications (full offline support via service worker)
2. WhatsApp Business API — job confirmation, ETA, invoice link
3. Customer e-sign on quotes (estimate approval flow)
4. Flat-rate price book → wired into job line items
5. Equipment/asset tracking per property

### Phase 3 — "Growth Engine"
1. Post-job review request automation (Google reviews)
2. Route optimisation for dispatch
3. Job costing report (labour + materials vs invoice)
4. Customer self-service portal
5. Purchase orders / supplier management
6. Technician earnings / payroll export

### Phase 4 — "Defensibility"
1. WhatsApp-based booking flow
2. Multi-branch support
3. AI-assisted job scheduling
4. Native mobile app (React Native / Expo)
5. SMS marketing campaigns for seasonal upsells

---

## 7. Summary Score vs Competitors

| Category | Fieldio | Jobber | Simpro SA | ServiceM8 |
|---|---|---|---|---|
| Core job lifecycle | 8/10 | 9/10 | 9/10 | 8/10 |
| Mobile experience | 4/10 | 9/10 | 7/10 | 9/10 |
| SA payment options | 2/10 | 1/10 | 6/10 | 4/10 |
| SA tax compliance | 2/10 | 1/10 | 8/10 | 5/10 |
| Accounting integration | 0/10 | 8/10 | 9/10 | 7/10 |
| WhatsApp / local comms | 0/10 | 0/10 | 2/10 | 0/10 |
| Customer portal | 2/10 | 8/10 | 6/10 | 5/10 |
| Offline / load shedding | 2/10 | 4/10 | 3/10 | 8/10 |
| Price / value | TBD | 7/10 | 4/10 | 8/10 |
| **Overall SA readiness** | **3/10** | **4/10** | **7/10** | **6/10** |

> Fieldio scores low today not because of bad architecture — the core is solid — but because the SA-specific integrations (tax, payments, accounting, WhatsApp) are all missing. These are the table stakes for the market.

---

*Audit prepared by Claude Code — June 2026*
