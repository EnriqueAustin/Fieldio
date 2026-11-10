# Fieldio — Full Go-Live Audit (2026-11-07)

**Purpose:** decide what has to happen before Fieldio runs day-to-day at our own plumbing company (West Coast, South Africa: office + a few techs/vans on Android phones, patchy signal).

**Method:** five parallel read-only audits (performance with live measurements, backend/API, office web pages, technician field app, go-live/hosting), with the top findings re-checked by hand against the code. API typecheck clean, **166/166 API tests pass**, web typecheck clean.

---

## Verdict

| Area | Score | One-liner |
|---|---|---|
| Field tech app | **64/100** (July: 58) | All July UX blockers fixed. Offline is now the weak spot: no signal at app start logs the tech out. |
| Office web app | **~65/100** | Core loop works up to invoicing. Price book is fake, no invoice PDF, no "record payment" button. |
| Backend / API | **~60/100** | Well structured and fast, but there are two serious security holes: PayFast secrets leak, and techs can fetch prices. |
| Go-live / ops | **~25/100** | Nothing is set up for hosting yet. The prod build outputs nothing, and seeding wipes the DB. |
| **Overall** | **~55/100 for real use** | Fine to demo and train on. **Not yet safe for real customer data or money.** Roughly 2–3 focused weeks of work to a safe pilot. |

The good news: the product itself is close. Most blockers are security fixes, a handful of missing office screens, offline hardening and hosting setup, not big new features.

---

## 1. Why it's slow on the laptop (measured)

**Almost all of it is dev mode, not the app.** The API answers in **5–40 ms**. The wait is Next.js compiling each page the first time you open it.

| What was measured | Result |
|---|---|
| API endpoints (jobs, estimates, dashboard, customers) | 5–40 ms warm, 104 ms first dashboard call |
| First visit to a page in dev | `/` **6.1 s**, others 0.4–2 s (warm cache). With a cold cache expect **5–20 s per page** |
| Second visit to the same page | 70–130 ms |
| Sidebar click to an already-compiled page | 42–460 ms |

**Causes, ranked:**
1. **Each page compiles on first open in dev.** 49 routes, all client components, no code splitting. `.claude/launch.json` runs plain `next dev` (webpack), while `npm run dev` uses `--turbo`.
2. **The API restarts itself repeatedly.** `tsx --watch` restarted **4 times in 6 s** on startup, triggered by files inside `node_modules`. Every restart takes ~3 s; pages retry and spin meanwhile.
3. **No click feedback.** There's no `loading.tsx` and the sidebar highlight only moves after the page arrives, so a 2 s compile feels like a freeze. *(This one also affects production.)*
4. **Laptop pressure.** Bitdefender scans `node_modules`/`.next` on access, and only 2.3 GB RAM was free during the test (Docker + 11 node processes).
5. **Prisma logs every SQL query** to the console (`packages/database/index.ts:8`). That's noise in dev and a problem in production.

**Fixes:**
- **Quick (under a day):**
  - Use `--turbo` in launch.json.
  - Make `tsx watch` ignore `node_modules`.
  - Add `(dashboard)/loading.tsx` plus instant sidebar highlight.
  - Log only errors/warnings from Prisma.
  - **You:** add a Bitdefender exclusion for the repo folder (or at least `node_modules` and `apps/web/.next`).
  - When you just want to *use* the app rather than code it, run `next build && next start`. Pages then switch in well under half a second.
- **Structural:**
  - Upgrade to Next 15 (fast stable Turbopack).
  - Lazy-load FullCalendar and the role dashboards.
  - Share one socket connection instead of three.
  - Run the dashboard's 5 analytics queries in parallel.

**In production you won't see the "massive wait".** Expect roughly the compiled-page numbers above (< 0.5 s).

---

## 2. P0 — must fix before real customers, money or techs in the field

### Security
1. **The pay page leaks PayFast secrets, so a payment can be forged.** `GET /public/pay/:token` returns raw `company.settings`, including the PayFast merchant key, passphrase and bank details (`payments.service.ts:24-40`, controller passes it straight through).
   - The PayFast ITN trusts the `X-Forwarded-For` header for its IP check (`payments.controller.ts:24`).
   - It never validates with PayFast server-side and never checks the amount.
   - **Anyone with a pay link could mark any invoice paid.**
   - Fix:
     - whitelist the public fields;
     - use `req.ip` with a proper trust-proxy setting;
     - call PayFast's validate endpoint;
     - reject amount mismatches.
2. **Techs can fetch prices and costs straight from the API.** The screens hide prices, but the data still reaches the phone.
   - `GET /finance/invoices`, `/invoices/overdue`, `/invoices/:id`, `/estimates`, `/estimates/:id/options` have no role check (`routes/finance.ts:16-38`).
   - The same goes for credit notes, statements, memberships and financing.
   - `/price-book` strips `unitPrice` but not `costPrice`.
   - `/operations/inventory` returns `unitCost` and lets techs edit cost/supplier.
   - Adding a line item returns the priced row.
   - `/company/me` gives every role the PayFast keys and EFT details.
   - Fix: restrict to office roles or strip fields for TECHNICIAN, and give techs a reduced `/company/me`.
3. **Twilio webhooks are unverified** and take `companyId` from the query string, so anyone can inject fake SMS or calls into the inbox. Verify the signature and map the To-number to the company.
4. **Logs contain tokens.** pino-http doesn't redact `Authorization` or cookies. Without a Resend key, password-reset emails are logged in full and marked SENT.

### Data safety
5. **`seed.ts` wipes the database** (66 `deleteMany` calls, no environment guard) and creates `password123` users. One wrong command on the live DB erases everything. Guard it so it refuses to run against anything but localhost.
6. **Missing provider keys fail silently.** Email, SMS and WhatsApp mark messages `SENT` with `providerId: 'dev-stub'` when keys are absent. In production that must be an error, not a fake success.
7. **Times in customer messages use server time.**
   - Reminders, the job summary PDF and en-route texts call `toLocaleString` without a timezone (`reminders.service.ts:6`, `jobs.service.ts:223,296`, `summary-pdf.service.ts`).
   - On a UTC server, customers get times 2 hours off.
   - Pass the company timezone everywhere and set `TZ=Africa/Johannesburg`.
8. **False "tech is on the way" SMS.** Quick-creating a job with a tech assigned immediately sends JOB_EN_ROUTE with a broken tracking link (`jobs.service.ts:987-996`). Delete that block.

### Office: can't run the business without these
9. **The price book is fake.** `settings/price-book` is hardcoded local state and saves nothing. Quotes, job line items and field quoting all depend on it, and there's no import. The API's bulk-create exists but has no UI.
10. **No invoice PDF or tax invoice document.** A SARS tax invoice needs:
    - the words "Tax Invoice";
    - our VAT number and address;
    - the customer's name, address and VAT number above R5,000;
    - a sequential number, date, VAT amount and VAT-inclusive total.

    Right now:
    - only the job-summary PDF exists;
    - the customer has no VAT-number field;
    - the "Tax Invoice" heading isn't rendered;
    - nothing stops "Tax Invoice" + VAT being issued without a VAT number.
11. **No button to record a single cash/EFT payment.** `POST /payments/invoices/:id/record` exists with no UI caller; only bulk EFT matching or online payment work.
12. **No invoice detail, edit or void.** List rows link to the job, and invoices are locked 1:1 to a job, so there's no manual invoice.
13. **Invoice numbers come from `count()+1`** (`invoices.service.ts:23`). Two at once cause a 500, and the prefix is borrowed from the EFT reference prefix. Use a per-company counter row.

### Field: offline on the West Coast
14. **No signal when opening the app means the tech is logged out.** `ensureFreshSession` logs out on *any* refresh failure, including no network (`lib/api.ts:35-37`). The cached jobs and offline queue are never reached. Only log out on a real 401/403.
15. **Offline caching is off for the whole first session after login.** The technician-device check runs once on mount, and login uses `router.push` without a reload (`providers.tsx:70`, `login/page.tsx:40`).
16. **Offline actions replay in parallel, stamped with server time.**
    - A job worked fully offline ends with near-zero hours, or stuck ON_SITE with the clock running.
    - Customers get "on my way" SMS hours late.
    - Fix: serialize per job (`scope`), send the client timestamp, and skip stale customer SMS.
17. **Failed syncs vanish.** After 3 failed retries a mutation is dropped while the banner says "All changes synced". Stuck photos are never retried, and axios has no timeout. Add an outbox with Retry, keep retrying network errors, and use a 20 s timeout.
18. **One failed 30-second poll hides the whole job list**, even with cached data (`technician-view.tsx:129`).

### Hosting (nothing exists yet)
19. **The production API build outputs nothing.** The root tsconfig has `noEmit: true`, and the API inherits it, so `npm start` has no `dist/`. `@fieldio/database` also points at raw `.ts`.
20. **No Dockerfile, prod compose, CI, backups or HTTPS setup.** HTTPS is mandatory for phone PWA install, camera and GPS.
21. **Migrations are probably out of step with the schema.** There are only 3 migrations and `db:push` was used. Run `prisma migrate status`/`diff` before the first `migrate deploy`; `db:migrate` is `migrate dev`, which is unsafe in prod.
22. **`TRUST_PROXY` is parsed backwards.** `z.coerce.boolean()` turns `"false"` into `true` (`config/env.ts:9`).

---

## 3. P1 — fix in the first weeks of use

**Field**
- Buttons stay disabled while an action is paused offline. The form submit waits forever offline, which invites a duplicate CoC.
- A completed job disappears instantly, so the tech can't send the pay link or summary or add after-photos. Add "Done today".
- Photos upload at full 3–8 MB. Resize on the phone to ~1600px before queueing: a big data-cost saving.
- Retried actions aren't idempotent: duplicate line items bill twice and deduct van stock twice. Add a client mutation ID.
- Forms and price book aren't prefetched for offline. Deleting an unsynced line item doesn't stick.
- The server doesn't enforce signature or required forms on completion (only the client does).
- Navigate uses address text, not the stored coordinates, so farms and rural plots fail. Add Waze.
- No push notification for emergency callouts.

**Office**
- Quotes and job details can't be edited after creation.
- The office can't correct labour hours, which breaks the "office corrects" rule.
- Dunning is in the OFFICE nav, but its buttons are ADMIN-only (403), and there's no rule editor.
- The statements picker caps at 100 customers, with no aging buckets or statement PDF.
- Estimates have no VAT fields, so quote totals won't match invoices (needs a migration). VAT isn't rounded to cents.
- **Nav sprawl:** the ADMIN nav has 36 items. Add module on/off toggles so a 3-van shop sees only jobs, schedule, quotes, invoices, customers, vans and reports.
- OFFICE role can't reach Schedule or Reports (and so not the Sage export).
- Team invites are "admin types a temp password": no invite email, no forced change.
- Business Hours and Notification settings pages are fake (Save does nothing).

**Backend**
- Payment recording has a read-modify-write race. Overpayments are silently lost, and the EFT reference isn't stored.
- Sockets broadcast to the whole company, so everyone sees everyone's notifications and price events. Use per-user/role rooms.
- Techs can create portal links, and the portal shows prices.
- Placeholder JWT secrets from `.env.example` pass validation. Reject them in prod.

**Ops and legal**
- Add Sentry and an uptime monitor.
- Stay on a single API instance (9 in-process `setInterval` schedulers would double-send).
- **WhatsApp will fail in practice.** It sends free-form text, and Meta rejects business-started messages without approved templates. Plan for templates and Meta Business verification, or rely on SMS/email first.
- **POPIA:**
  - The Terms/Privacy pages linked from register don't exist.
  - There's no marketing consent/opt-out or STOP handling.
  - There's no data export/erase.
  - Photos sit in a public bucket; switch to presigned URLs.
  - Register an Information Officer.

---

## 4. P2 — later
- **Sage:** export is a generic CSV with no account or tax codes, so it's a report, not a sync. Xero is a stub.
- **Payments:** Stripe can't be used by an SA business, so hide it. PayFast is the real path; consider Yoco or Ozow later.
- **Field info:** show geyser/equipment details (the `PropertyAsset` model exists). Add a photo field in forms for CoC evidence, decimal quantities (pipe per metre), and "needs follow-up / needs parts" actions.
- **Data use:** the tech app sends GPS nowhere, so `/track` has no live position. It also polls every open job with base64 signatures every 30 s; limit to today and poll only while visible.
- **Route planner (uncommitted work):** its 35 km/h average roughly doubles inter-town estimates on the West Coast.
- **Import gaps:** no XLSX/ServCraft preset for customers, no price book/stock import, no opening balances.
- **Other:** `/health/db` leaks the user count, public `/auth/register` should be disabled for a single company, and tokens never expire.

---

## 5. What's solid (keep)
- Fast API: JWT auth with no DB hit, 126 indexes, paginated lists.
- Consistent `companyId` scoping.
- Refresh-token rotation and password reset.
- Helmet, CORS and layered rate limits.
- Safe photo upload pipeline.
- Decimal money columns.
- Tech UX: two-screen job flow, sticky status bar, forms/CoC with `canIssueCoC`, camera + gallery photos, agenda schedule, Overdue/Today/Upcoming grouping, call/navigate, site history, van-stock "use on job", and pay-link closeout with no amounts shown.
- Office: schedule with drag-drop, customer CRM + CSV import (SA headers, dedupe), quote → portal approve → job, bulk invoicing, bulk EFT match, PayFast checkout, public booking and tracking pages, KPI/reports.
- 166 API tests green, and both apps typecheck.

---

## 6. Go-live plan

**Week 1 — Security + data safety:** P0 #1–8, #22.

**Week 2 — Office essentials:** price book (CRUD + CSV import), tax invoice PDF + customer VAT field, record payment, invoice detail/void, invoice counter, module toggles to trim the nav.

**Week 2–3 — Offline hardening:** P0 #14–18 plus photo resize and idempotency. Then test a full job in airplane mode on a real Android phone.

**Week 3 — Hosting:**
- Fix the API build (or run with `tsx`) and add a Dockerfile.
- Set up Caddy for HTTPS on `app.` and `api.` subdomains of a `.co.za` domain.
- Use managed Postgres with daily backups plus a nightly `pg_dump`.
- Store photos in Cloudflare R2.
- Add Resend with a verified domain, Sentry and UptimeRobot.
- Set `TZ=Africa/Johannesburg` and run one instance.

**Recommended hosting:**
- Vultr Johannesburg VM (2 vCPU/4 GB) + Vultr managed Postgres + R2: **~R800–1,400/month** plus SMS costs.
- AWS Cape Town (af-south-1) is the premium option at ~R2,000–3,500/month.
- Avoid offshore-only hosts (Render, Railway, Fly): there's no SA region, so phones see higher latency.

**Rollout:**
1. Create the company and admin by hand (never seed prod).
2. Import customers and sites via CSV, enter the price book, then vans and stock.
3. Leave open invoices in the old system.
4. **Parallel-run 2–4 weeks.** New jobs go through Fieldio, and the old system stays the record for money. Reconcile weekly.
5. Turn on only the core loop. Keep campaigns, reviews, memberships, financing, portal reschedule and field quoting **off**. Keep dunning and reminders off until messaging is proven.
6. **Training:**
   - **Office:** about 1 hour.
   - **Each tech:** about 30 minutes on their own phone. They install the PWA over HTTPS, grant camera and location, and do one practice job in airplane mode.

---

## 7. Progress — Week 1 done (2026-11-07, uncommitted)

All week-1 security and data-safety P0s are fixed in the working tree. Nothing is committed. API: **252/252 tests** (86 new). API and web typechecks are clean.

| P0 | Fix |
|---|---|
| #1 PayFast leak / forged payment | The pay page gets a whitelisted payload (no keys, settings or customer email). The ITN uses `req.ip`, requires a passphrase, checks signature, `merchant_id` and exact amount, then validates server-to-server. Duplicate ITNs return 200 and record once. Checkout is now signed. Payment recording is race-safe, overpayments are recorded and flagged, and the EFT reference/note is stored in `Payment.metadata`. Stripe only shows when configured. Marketing copy is removed from the pay page. |
| #2 Tech price leaks | Finance, credit-note, statement, membership, financing and job-expense GETs and the jobs list now return 403 for TECHNICIAN. Price book strips `costPrice`. Inventory strips `unitCost`, and techs can only change quantity. The line-item POST response is stripped. The summary PDF is send-only for techs on their own jobs. Tech job payloads drop `summaryPdfUrl`. `/company/me` is reduced for techs, and PayFast secrets are nulled for non-admins. Portal-link creation is restricted to office roles. |
| #3 Twilio webhooks | SMS, voice and status webhooks verify `X-Twilio-Signature`. The company comes from the dialled number, never the query string. |
| #4 Tokens in logs | pino redacts auth headers, cookies and secret body fields. Email stubs log only to/subject. |
| #5 Seed wipes DB | `seed-guard.ts` refuses on production or a non-local DB unless `ALLOW_DESTRUCTIVE_SEED=yes-wipe-<db>`. New `db:deploy` / `db:status` scripts. |
| #6 Silent fake "SENT" | In production, a missing provider key records the message as FAILED and logs an error. |
| #7 Timezone | New `utils/timezone.ts`. Reminders, appointment text, summary PDF, time-tracking "today/week" and the KPI range use the company timezone. |
| #8 False en-route SMS | Removed from quick-create. |
| #22 TRUST_PROXY | Parsed correctly (`true` means 1 hop). Placeholder or identical JWT secrets are rejected in production. |
| Extra | Sockets require a JWT and use user/role rooms, and price fields are stripped for non-office roles. Prisma query logging is now opt-in (`PRISMA_LOG_QUERIES=1`), which also speeds up dev. `/health/db` no longer exposes the user count. |

**Open decisions and leftovers:**
- **Tech Inbox: DONE.** The company SMS inbox is now office-only (API returns 403 for TECHNICIAN), and the Inbox tab is removed from the tech phone and sidebar nav.
- **Price reads allowed for every role except TECHNICIAN.** CSR, SALES and ACCOUNTANT can read prices; tighten per route if needed.
- **Companies with PayFast must set a passphrase**, otherwise PayFast is hidden.
- **No settings field for the company's Twilio number yet** (`integrations.twilio.phoneNumber`). Single-company installs fall back automatically.
- **Still to check for money fields:** projects, permits, bookings, van service logs, leads, warranty, dunning and form-submission GETs.
- **Server-local time remains** in van-service due messages, analytics month boundaries and subcontractor month boundaries.

---

## 8. Progress — Week 2 done (2026-11-09, uncommitted)

The office essentials are built. API: **302/302 tests**. API and web typechecks are clean, and `next build` passes. There is one new migration, `20261107111518_week2_tax_invoice_fields`, applied to the local dev DB; run `db:deploy` on the server.

| Item | Result |
|---|---|
| Price book (P0 #9) | A real page with search/filter/paging, add/edit/archive, and CSV import with auto-mapping, preview and a template download. Writes are for ADMIN and OFFICE. Techs still get no `unitPrice`/`costPrice`. Import upserts by SKU. |
| Tax invoice PDF (P0 #10) | A4 PDF showing: <ul><li>"Tax Invoice" only when the company has a VAT number</li><li>supplier and buyer VAT numbers and addresses</li><li>lines, VAT and totals</li><li>EFT details</li><li>a VOID banner when voided</li></ul> Available at `GET /finance/invoices/:id/pdf` for office roles and `GET /public/payments/invoices/:token/pdf` from the pay page. |
| Customer VAT number and billing address | Captured on the create, edit and detail pages and in CSV import, with SA VAT format validation (10 digits starting with 4). Snapshotted onto each invoice. |
| Record payment (P0 #11) | Dialog on the invoice page: cash, EFT, cheque, card machine or other, with a stored reference, and an overpayment warning. |
| Invoice detail and void (P0 #12) | New `/invoices/[id]` page with PDF, send, copy pay link, record payment and void. Void requires a reason, is refused when payments exist, keeps the number and kills the pay link. List rows now open the invoice. |
| Invoice numbering (P0 #13) | Atomic per-company counter (`Company.invoiceSequence`), continuing from INV-2026-1039, so the next number is INV-01040. Uses a new `billing.invoicePrefix` setting. VAT is rounded to cents. A company with no VAT number charges no VAT. |
| Quote VAT (P1) | Quotes store subtotal, VAT and total. Shown in the create dialog, list, detail and customer portal. Older quotes show "VAT not itemised". Field quotes are still price-free for techs. |
| Menu clean-up (P1) | A Modules card in Company settings switches 21 optional modules. 14 are off by default, so the admin menu drops from 36 items to about 22. Office users get Schedule and Reports. Business Hours and Notifications are hidden and marked "coming soon". |

**Leftovers:**
- Price-book import accepts `unit` and `taxable` but doesn't store them; there are no columns yet.
- Invoices are still tied 1:1 to a job, so there are no standalone/manual invoices.
- No quote PDF.
- Dunning is now OFF by default. Switch it on in Modules once messaging is proven.

---

## 9. Progress — Offline hardening done (2026-11-09, uncommitted)

The field-app offline P0s (#14–18) and most of the field P1s are fixed. API: **316/316 tests**. Web typecheck is clean and `next build` passes. There is a new migration, `20261109120000_offline_idempotency_keys`; Docker was down, so it was generated offline and **not yet applied locally**. Run `npm run db:migrate` once Docker Desktop is running.

| Item | Result |
|---|---|
| #14 Logged out with no signal | A tech is logged out only when refresh returns 401/403. On a network error the saved user stays and the app renders from the saved cache. On reconnect, the login refreshes before queued changes resume. |
| #15 No offline cache on first session | Offline storage follows the logged-in role live, and a technician login does a hard reload. |
| #16 Out-of-order replay, server-time hours | <ul><li>Field actions replay strictly in order (one shared queue; photos and receipts have their own).</li><li>Each action carries a one-time `Idempotency-Key`, and status changes carry `clientAt`.</li><li>The server uses the tap time when it's within 24 hours and not before the previous stamp.</li><li>Customer "on my way" and "arrived" messages are skipped if over 15 minutes old.</li><li>Backwards moves (e.g. ON_SITE after COMPLETED) are ignored.</li></ul> |
| #17 Failed syncs vanish | <ul><li>Transient errors (network, 5xx, 429) keep retrying with backoff up to 60 s.</li><li>Requests time out after 20 s (uploads 120 s).</li><li>New outbox sheet lists queued and failed actions with Retry and Discard, and shows the server's message on 4xx.</li><li>The banner no longer says "All changes synced" falsely.</li><li>Stuck photos re-upload on start and on reconnect.</li></ul> |
| #18 One failed poll hides jobs | Cached jobs stay with a "Couldn't refresh" line. Polling only runs while the app is visible and online. |
| Duplicate replays | New `middleware/idempotency.ts` (`IdempotencyKey` table, kept 7 days) covers status, checklist, notes, signatures, line items, forms, van-stock use, field quote, field invoice, expenses and photos. A duplicate arriving while the first is still running gets `503 Retry-After`, so it never runs twice. |
| Completion rules on server | A technician can't complete a job without a customer signature and every `requiredForCompletion` form. Office roles can still close a job. |
| Field UX | <ul><li>Buttons work while actions are paused offline.</li><li>CoC/forms show "Saved — will send when online" with no double submit.</li><li>Deleting an unsynced line item cancels it properly.</li><li>"Done today" section, so the job stays open after completion.</li><li>Photos resized on the phone (1600 px, JPEG 0.72) with queued thumbnails.</li><li>Google Maps + Waze using coordinates.</li><li>Price book and forms for today's jobs are cached for offline.</li><li>The assigned feed is limited to overdue, today and the next 7 days plus done-today, without signature images (less data).</li></ul> |

**Not verified on a real phone yet.** Before rollout, run one full job in airplane mode on an Android phone: start, line items, photos, form/CoC, signature, complete. Then reconnect and check the hours, the order of events and that nothing is duplicated.

**Left open:**
- No push notifications for emergency callouts yet.
- The route planner's 35 km/h average is still unchanged.
- The phone still doesn't send GPS, so `/track` has no live position.
- Summary-PDF send and restock requests have no replay protection.
