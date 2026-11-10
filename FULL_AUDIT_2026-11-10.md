# Fieldio — Go-Live Audit, tab by tab (2026-11-10)

**Question answered:** what has to happen before we run our own plumbing business on this, day to day.

**Method:** six parallel read-only audits of the current **uncommitted** working tree (core office tabs, money tabs, operations/settings/public tabs, the technician phone app, the backend as an attacker, and go-live/ops), with every finding below re-verified by hand against the code. Measured today: **316/316 API tests pass**, API typecheck clean, web typecheck clean, `next build` succeeds (52/52 pages).

This supersedes `FULL_AUDIT_2026-11-07.md`. That document's sections 7–9 (week-1 security, week-2 office essentials, offline hardening) are real and present in the working tree — I spot-checked them and they hold. What follows is what is **still** wrong.

---

## Verdict

| Area | Score | One line |
|---|---|---|
| Field tech app | **70/100** | Best part of the product. Offline is genuinely hardened. Van stock is the hole, plus one cost leak. |
| Office core loop | **60/100** | You can run a job end to end, but you cannot **edit or cancel** one, and a calendar drag reopens completed work. |
| Money / finance | **58/100** | Quote → invoice → pay works and the tax invoice is close. No receipt, no refund, no usable credit note, reports are wrong. |
| Backend security | **55/100** | Last round's P0s are fixed, but ~25 endpoints have no role guard and there are three cross-tenant writes. |
| Operations tabs | **45/100** | Inventory cannot accept a single item. Forms produce no CoC document. |
| Go-live / hosting | **20/100** | Unchanged since Nov 7. No build artifact, no container, no HTTPS, no backups, no monitoring. |
| **Overall for real use** | **~58/100** | Good enough to train on. **Not safe for real customer data, real money, or a tech who quits.** |

**Honest timeline: 4–5 focused weeks** to a safe parallel run. Three of those weeks are plumbing-the-plumbing (deployment, backups, RBAC, audit trail), not features.

**The single biggest risk right now:** ~4,900 lines of unreviewed, uncommitted work. Commit it in reviewable chunks before anything else — a laptop failure today loses three weeks.

---

## 1. Tab-by-tab status

**WORKS** = real data, create/edit/delete wired end to end. **PARTIAL** = reads real data, key actions missing or silently failing. **FAKE** = hardcoded, local-state-only, or the button does nothing.

### Core loop

| Tab | Status | The blocking gap |
|---|---|---|
| Dashboard | PARTIAL | Revenue counts DRAFT **and VOID** invoices; quote close-rate can read 250%; CANCELED jobs counted as "active" |
| Schedule | PARTIAL | **A drag resets job status to ASSIGNED** — reopens completed, invoiced jobs. Soft-deleted jobs still on the board. No van double-booking check |
| Jobs (list) | PARTIAL | **Only ever loads 20 jobs**; tabs, search and badges filter client-side over those 20. No pager at all |
| Job detail | PARTIAL | **No edit, no cancel, no reschedule, no reassign.** Tech notes, signature, forms/CoC and the attached quote are fetched and never rendered. No labour hours on the job card |
| Quick job | WORKS | No duration field → no `scheduledEnd` → the job **never appears on My Schedule** and conflict detection never fires |
| My Schedule | PARTIAL | Invisible to jobs with no end time, i.e. most jobs the office creates |
| Customers | WORKS | — |
| Customer detail | PARTIAL | **A property address can never be edited or deleted** (no route exists). Edit dialog drops `notes` and `status` |
| Customer import | WORKS | Dedupe-skipped rows lose their site address |
| Projects | FAKE | Create always 400s (sends `customerId: ""`). Module off by default |
| Job templates | PARTIAL | `defaultChecklist` hardcoded `[]`; no edit; prices typed free-hand, no price-book link |
| Labour Hours | PARTIAL | **No way to correct an entry.** Delete is a hard delete, no confirm, no audit. 100-row cap, no pay-period view |
| Leads | FAKE | No lead can be created; a lead can never be marked WON or LOST. Module off |
| Bookings | PARTIAL | Convert always creates a new customer+property (no dedupe), is re-runnable, and is open to technicians. No Decline action |

### Money

| Tab | Status | The blocking gap |
|---|---|---|
| Quotes | PARTIAL | **No edit/revise, no PDF, no quote number** (customer sees a UUID slice), quotes never expire |
| Invoices (list) | PARTIAL | Hard 100 cap with client-side search — invoice 101 is unreachable |
| Invoice detail | WORKS | PDF, send, pay link, record payment, void all real. No credit note from here, no refund, no receipt |
| Credit notes | FAKE | **You cannot create one.** VAT hardcoded 15% ignoring company settings. No PDF |
| Overdue | WORKS | — |
| Statements | PARTIAL | No PDF, no aging buckets; opening balance includes DRAFT and VOID; period end cut 2h short (UTC) |
| Dunning | PARTIAL | Buttons 403 for non-admins with no message. No rule editor. **Its scheduler runs even with the module off** |
| Memberships | PARTIAL | No recurring billing; the member-discount endpoint has no caller. A register, not a plan |
| Financing | PARTIAL | Manual status tracker, no provider. Off by default |
| Flat rate | PARTIAL | A bundle cannot be pushed onto a job or quote. Off by default |
| Price Book | WORKS | `unit` and `taxable` accepted by the importer and discarded |
| Reports | PARTIAL | **The From/To pickers don't affect the reports.** "Costs" are selling prices, so margin is fiction. Revenue is VAT-inclusive |
| KPI | PARTIAL | Writes a snapshot row on **every read**, refetching every 60s. VAT-inclusive revenue |
| Scoreboard | PARTIAL | VAT-inclusive; OFFICE gets a 403 while the module reads as on |
| Reports → playback | ORPHAN | No nav entry; the phone sends no GPS so it is always empty |

### Operations

| Tab | Status | The blocking gap |
|---|---|---|
| Inventory | PARTIAL | **Add item always fails** (form sends `name/quantity/minLevel`, API demands `sku` + `minQuantity`) and the error is swallowed. No edit UI at all → `defaultSupplierId` unsettable → alerts and POs are dead |
| Inventory alerts | ORPHAN | No nav entry, no link. Targets have no UI so alerts rarely fire. PO "received" does not increase stock |
| Vans / Teams | WORKS | No edit or retire (so service alerts can't be configured). **`/vans/:id/service-logs` leaks cost to techs** |
| My Van stock | PARTIAL | **Not offline-queued** (silent loss), read-modify-write so two crew overwrite each other, and **parts used are never billed** |
| Suppliers | PARTIAL | No PO status change, detail, print or email |
| Subcontractors / Certifications / Permits / Warranties | WORKS (thin) | All off by default. `/permits` leaks `fee` to techs |
| Digital Forms / CoC | PARTIAL | **No issued document** — no CoC PDF, no certificate number, nothing to hand the customer. **Templates cannot be edited.** Submitted data is never validated against the form schema |

### Comms

| Tab | Status | The blocking gap |
|---|---|---|
| Inbox | PARTIAL | **A failed send renders as sent.** Inbound matching on the last 9 digits attaches threads to the wrong customer. No STOP handling |
| Calls | FAKE | The voice webhook answers "please hold" and never forwards. Off by default — keep it off |
| Campaigns | FAKE | **Sends nothing** — writes `status: 'SENT'` rows with no provider call, then reports the counts. Off by default |

### Settings, auth, public

| Tab | Status | The blocking gap |
|---|---|---|
| Settings → Company | WORKS | **No company address and no logo field** — so the tax invoice PDF can never print a supplier address |
| Settings → Team | PARTIAL | **No deactivate, no role change, no remove** (endpoints exist, no UI). Invite = admin types a password, no email, no forced change, no strength rule |
| Settings → My Account | WORKS | Password only; a tech can't fix their own name |
| Business Hours / Notifications | FAKE | Honestly labelled "coming soon" and hidden. So: scheduling has no working-hours awareness, and every customer message template is hardcoded in API source |
| Settings (index) | MISSING | `/settings` 404s |
| Login / Register / Reset | WORKS | **Public self-registration is still open** and the login page advertises a free trial. Terms/Privacy are plain text; the pages don't exist |
| `/pay/[token]` | WORKS | Token never expires; a DRAFT invoice with a token is payable; the page labels every invoice "Tax Invoice" even with no VAT number |
| `/portal/[token]` | PARTIAL | **Shows DRAFT quotes and DRAFT invoices** the office hasn't sent |
| `/track/[token]` | WORKS | Token is permanent — the link shows job status, address and tech name forever |
| `/book/[companyId]` | PARTIAL | No spam protection beyond 10/h; email and phone both optional; no consent; US field labels (State/ZIP) |

### Technician phone app, by the tech's day

| Step | Status | The blocking gap |
|---|---|---|
| Cold start, no signal | PARTIAL | The service worker never caches a navigation, so only `/` survives offline. **The persisted cache expires after 24h** — off-signal Friday to Monday restores nothing, queue included |
| Today's jobs | WORKS | — |
| Navigate / on my way / arrive | WORKS | A job spanning two days loses its clock (the 24h `clientAt` window falls back to server time). My Schedule's "On my way" isn't queued and can double-text |
| Line items | WORKS | No decimal quantities — pipe per metre can't be recorded (the API already accepts it; the UI uses `parseInt`) |
| Van stock | BROKEN | Not queued, not idempotent client-side → double deduction on retry; **techs can read `unitCost` via `GET /vans/:id`**; parts never billed |
| Photos | PARTIAL | **Expense receipts are uploaded into the customer photo gallery and then deleted.** No queue cap; a storage-quota error loses the photo silently |
| Form / CoC / signature | WORKS | Forms prefetched for today + overdue only; a synced signature renders as a broken image |
| Complete | WORKS | Server enforces signature + required forms. **Depends on the `IdempotencyKey` migration being applied — if it ships unapplied, every field write 500s** |
| Pay link / summary | PARTIAL | "Send job summary" hangs forever offline and is lost on reload; double-tap online sends two emails |
| Outbox / retry | PARTIAL | A mutation persisted as `pending` is never resumed — it shows "Syncing…" forever with no Retry |
| Hours | WORKS | Correctly read-only and derived from status. **But a van crew-mate who drives the status gets zero hours** — credit goes to `job.techId` |

---

## 2. P0 — must fix before real data, real money, or a tech who quits

### Security and tenancy
1. **~25 endpoints have no role guard** — a technician's token reads: every project with its estimates and invoices, recurring-plan priced templates, lead funnel revenue and marketing spend, van service costs, permit fees, every CoC submission company-wide, every colleague's live GPS and full-day route, the whole staff list with permissions, every customer address, all inbound bookings. Full list in the appendix.
2. **Any technician can change the status of any job in the company** — `PATCH /jobs/:id/status` has no role guard and no assignment check. They can complete someone else's job, fire the customer SMS, and rewrite the assigned tech's derived timesheet.
3. **Three cross-tenant writes:** `toggleChecklist` updates a checklist row by id alone; `PATCH/DELETE /branches/:id` has no `companyId` filter and takes `data: req.body` raw; `projects.create/update` spreads the raw body, so `{"companyId":"<other>"}` moves a project between tenants.
4. **Public `/auth/register` is open** — anyone on the internet creates a company and an ADMIN in the production database.
5. **Technicians can read part costs** via `GET /vans/:id` (raw `inventory` including `unitCost`) and `GET /vans/:id/service-logs`.
6. **Photos and signatures live on public object-storage URLs.** `presignGet` exists in the storage service and has zero callers. Customer property photos and signature images are world-readable forever.
7. **The `modules` settings are nav-only.** Nothing server-side reads them and the schedulers ignore them — **dunning will message customers with the module switched off.**

### Money
8. **No receipt of any kind.** The customer who pays cash gets nothing back.
9. **No refund or payment reversal**, and a payment can be recorded against a VOID invoice (it resurrects as PAID). A payment keyed to the wrong invoice is a dead end.
10. **Credit notes cannot be created from the UI**, and the service hardcodes 15% VAT regardless of company settings or VAT registration.
11. **Reports are wrong in three ways that matter:** the date pickers don't affect the numbers; "cost" is the selling price (so materials are double-counted and margin is fiction); revenue is VAT-inclusive everywhere, so it reads ~15% high against Sage.
12. **Tax invoice gaps:** no supplier address field exists anywhere to print; buyer details aren't enforced above R5,000; the invoice is dated at draft creation and the number is burned then too, so abandoned drafts leave gaps in the issued series. `DELETE /finance/invoices/:id` sets `deletedAt` (alongside VOID), hiding the number from every list and export.
13. **No audit trail on money.** `AuditLog` is written by jobs, vans and POs only — invoice issue, invoice void, payment recording and price changes leave no who/when record.

### Data loss and corruption
14. **A calendar drag resets job status**, reopening completed and invoiced jobs.
15. **The office cannot edit or cancel a job**, and cannot correct labour hours — which makes the whole "techs don't log hours, the office corrects" rule undeliverable.
16. **A property address can never be corrected.** Every future job sends the van to the wrong place.
17. **Labour-hours delete is a hard delete** with no confirmation and no audit — one misclick destroys a payroll record.
18. **Expense receipts are posted into the customer photo gallery and deleted.**
19. **Inventory cannot accept a single item** — every create 400s silently.

### Deployability (all unchanged since Nov 7)
20. **The API produces no build artifact.** `npx tsc` exits 0 and writes no `dist/` — the root `noEmit: true` is inherited. `npm start` cannot work. `@fieldio/database` also points at raw `.ts`.
21. **No Dockerfile, no production compose, no reverse proxy, no TLS, no CI, no deploy script, no process manager.** HTTPS is mandatory for PWA install, camera and GPS on the techs' phones — there is no path to it today.
22. **No backup or restore of any kind.** No `pg_dump`, no schedule, no tested restore.
23. **No error tracking and no uptime monitoring.** Zero hits for Sentry or any equivalent.
24. **Migration state is unverified** — Docker was down, so `prisma migrate status` could not run. The `IdempotencyKey` migration is still marked "not applied locally"; if it ships unapplied, every field write from a phone 500s.

### Compliance
25. **POPIA: nothing exists.** No consent capture, no STOP/opt-out handling, no data export, no erasure, no privacy or terms page (register links to text, not pages), public photo and signature URLs, and no Information Officer registered.
26. **No CoC document.** A submission is JSON plus a signature image in a dialog — no PDF, no certificate number, nothing retained or handed over. Confirm separately with PIRB whether a Fieldio PDF is even accepted before relying on it.
27. **No 5-year retention mechanism** — no DB backup, no bucket lifecycle, no archive.

---

## 3. P1 — fix in the first weeks of use

**Office:** jobs list paging plus date/tech filters; render notes, signature, forms and the attached quote on the job card; subtract labour from job-costing margin; a van-assigned job records zero hours for the crew; quick-create needs a duration; bookings convert needs dedupe and idempotency; a Decline action; statement PDF, aging buckets and a correct opening balance; a quote PDF, quote number and real expiry; the Sage export must exclude DRAFT and VOID and gain account/tax codes; stop the KPI endpoint writing on every read; inbox send honesty and E.164 customer matching; PO receive should increase stock; link or delete the orphaned pages (`/my-van`, `/inventory/alerts`, `/reports/playback`, `/settings`, business-hours, notifications).

**Field:** cache navigations in the service worker and extend the 24h cache window; queue the summary send and My Schedule's "on my way"; resume hydrated `pending` mutations and offer Retry; cap the photo queue and surface quota errors; credit hours to the actor, not `job.techId`; decimal quantities; create a job line item when van stock is drawn; **push notifications for after-hours callouts** (there is no channel at all today — the app must be open); let a tech see geyser/equipment history (the data exists, no UI renders it).

**Backend:** revoke sessions on role change, deactivation and password change; rate-limit `forgot-password` properly (`skipSuccessfulRequests` means attempts are never counted); stop logging public tokens in URLs; expiry and revocation for portal and tracker tokens; extend idempotency to the money writes (a double-clicked "Record payment" books the cash twice) and bind the key to method + path; claim-before-send in all 10 schedulers; re-check socket tokens; technicians currently receive socket events for every job in the company.

**Ops:** pin Node; graceful shutdown and a boot DB ping; log shipping or rotation; `Invoice.invoiceNumber` non-null; `@db.Decimal(12,2)` on money columns; a CI workflow running the tests, both typechecks and `next build`; give Playwright a `webServer` and an npm script (the two e2e specs are manual-only today).

**Fakes to kill or hard-gate:** campaigns (sends nothing, reports success), the voice webhook (parks callers), business-hours and notification settings. Either delete the pages or block the modules server-side.

---

## 4. Shortest credible path

**Week 0 (now): commit the working tree** in reviewable chunks. Three weeks of unreviewed work on one laptop is the biggest single risk on this list.

**Week 1 — make it deployable.** `noEmit: false` + `tsc-alias` in the API (or commit to `tsx` in production and move it to dependencies); Dockerfiles and a production compose; pin Node; graceful shutdown; buy the `.co.za` domain and a Johannesburg VM; Caddy TLS on `app.` and `api.`.

**Week 2 — security and tenancy.** Role-guard the ~25 open endpoints; assignment check on job status; fix the three cross-tenant writes; close public register; strip van costs; presigned URLs for photos and signatures; enforce `modules` server-side and gate the schedulers; `AuditLog` on invoice issue/void, payment and price changes.

**Week 3 — data you can trust.** Start Docker, settle migration state, switch the runbook to `db:deploy` only; nightly `pg_dump` to R2 **plus one rehearsed restore**; office job edit/cancel; property edit; hours correction with audit; jobs list paging; inventory create/edit; fix the reports (date range, real costs, ex-VAT revenue).

**Week 4 — money and law.** Receipt document; payment reversal; credit-note create + PDF + company VAT rate; company address and logo on the invoice; Sentry and UptimeRobot; privacy and terms pages; STOP handling and booking consent; register the Information Officer; PayFast live with a passphrase and `sandbox: false` plus one R1 live transaction; Resend domain verified; decide SMS (Twilio ~R550–950/mo vs a local aggregator at ~R120–250 — the code is Twilio-only, so swapping is dev work); park WhatsApp until Meta templates are approved.

**Week 5 — the real test.** One full job in airplane mode on an actual Android phone over HTTPS: start → line items → van stock → photos → CoC → signature → complete → reconnect. Check derived hours, event order, no duplicates, stock decremented once. Double-tap Complete. Two techs on one van. Then load real data: company settings, users, customers and sites by CSV, price book by CSV, vans and stock, form templates.

**Weeks 6–9 — parallel run.** New jobs in Fieldio; the old system stays the money record; reconcile weekly; keep a printed paper fallback ("WhatsApp the job to the office, write the slip by hand"). Cut over only after two consecutive weeks reconcile to the cent.

**Keep off at go-live:** campaigns, calls, reviews, memberships, financing, flat rate, projects, leads, dunning, portal self-reschedule, field quoting.

**Infrastructure cost:** roughly **R750–1,450/month** (JHB VM, managed Postgres or self-hosted plus `pg_dump`, Cloudflare R2, domain) plus messaging, plus PayFast at ~3.0–3.9% + ~R2 per transaction. Estimates at ~R18/USD, not quotes.

**Cannot be imported at cutover:** open invoices and customer balances (invoices are 1:1 with a job, so there is no standalone invoice), opening balances, job history, price-book `unit`/`taxable`, anything from the old system in its own format. Leave open invoices where they are.

---

## 5. What's genuinely solid (don't touch it)

- The technician field flow: two-screen job, sticky action bar, forms/CoC with `canIssueCoC`, photos resized on the phone with an IndexedDB queue, ordered replay with idempotency keys, a real outbox with Retry and Discard, "Done today", Maps + Waze from coordinates, server-enforced completion rules.
- Hours derived purely from job status, with no manual entry anywhere on a tech screen.
- Auth: hashed single-use reset tokens, refresh rotation with a grace window, per-account and per-IP limits, placeholder-secret rejection in production.
- PayFast ITN now does IP + signature + merchant_id + exact amount + server-to-server validation, and the pay page payload is a real whitelist. Twilio webhooks verify signatures and resolve the company from the dialled number.
- Atomic gap-free invoice numbering, race-safe payment recording, VAT rounded to cents, zero VAT when the supplier isn't registered.
- Price book (CRUD + CSV import), customer CSV import with SA headers and dedupe, invoice detail with PDF/send/record/void, the dispatch calendar, 127 indexes, consistent `companyId` discipline on nearly every read.
- 316/316 API tests, both typechecks clean, `next build` green.

---

## Appendix — endpoints with no role guard

Reachable by any authenticated user, technicians included:

`GET /projects`, `/projects/:id` (includes estimates + invoices) · `GET /recurring` (priced templates) · `GET /leads/funnel`, `/pipeline`, `/sources` (revenue + marketing spend) · `GET /vans/:id`, `/vans/:id/service-logs` (costs) · `GET /digital-forms/submissions`, `/submissions/:id` (every CoC company-wide) · `PATCH /jobs/:id/status`, `/checklist/:checkId`, `POST /:id/notes`, `/:id/signatures` (no assignment check) · `GET /permits`, `/permits/:id`, `/permits/inspections/upcoming` (fees) · `GET /warranty-claims` and sub-routes · `GET /bookings`, `POST /bookings/:id/convert` · `GET /tracking/latest`, `/playback/:userId`, `/active-techs` (colleagues' GPS) · `GET /dunning/rules` · `GET /inventory-alerts`, `/targets`, `/inventory-transfers` (+ POST) · `GET /documents` (no entity-ownership check) · `GET /certifications`, `/certifications/user/:userId` · `GET /users`, `/users/skills-catalog` (permissions JSON) · `GET /branches` · `GET /time-tracking?userId=` (CSR/SALES see others' hours) · `GET /schedule/events`, `/unscheduled`, `/my-week` · `GET /operations/properties`, `/property-assets` (whole address book) · `POST /finance/estimates/field` (opt-in gate enforced, no assignment check)
