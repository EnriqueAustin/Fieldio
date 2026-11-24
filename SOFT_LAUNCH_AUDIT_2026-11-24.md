# Soft-launch audit: job scheduling, job handling and the field tech app (2026-11-24)

**Scope:** everything a small SA electrical, plumbing or building firm (1–15 people) touches to book a job, dispatch it, do it on site and close it out. Finance, CRM extras and marketing are out of scope except where they block that loop.
**Compared against:** ServCraft (SA), Tradify, Fergus, simPRO, ServiceM8, Jobber.
**Method:** I ran three read-only auditors in parallel: office job lifecycle, dispatch, and field tech app. They traced UI to API to DB on the current working tree, including uncommitted work. I then checked the headline findings myself. All the API test suites run pass (scheduling, field, price-leak, offline replay). The web `tsc` is clean as of writing. Nothing was clicked through in a running browser.

## Verdict

**Field tech app: 72/100. Office job handling: 58/100. Dispatch: 60/100. Soft-launch readiness: not yet. The gap is about 2 focused weeks, plus hosting.**

The core loop works end to end and has real strengths:
- offline-first tech app;
- server-side price hiding;
- status-driven timesheets;
- one-tap invoice and pay link;
- van crews.

The problems are the things demo users will try in their first 10 minutes:
- Office staff can't close a job without texting the customer.
- "On my way" and "Pause" are broken.
- The tech is never told when their job moves.
- A CoC never becomes a PDF.
- The notification settings switch nothing off.
- Builders have no multi-day or multi-visit jobs.

> **Heads-up:** a schedule-board rebuild is in flight in the working tree (untracked `dispatch-board.tsx`, `dispatch-map-inner.tsx`, `tech-route-panel.tsx`, `job-quick-view.tsx`, `lib/schedule-utils.ts`, a `/recurring` page). During the audit it briefly broke the web typecheck. It is clean now but not wired into `/schedule`. About 60 files are uncommitted, so commit before anything else.

---

## 0. Pre-req: can a demo user even get in?

| Item | State |
|---|---|
| Hosting | **Not ready.** No Dockerfile, HTTPS, backups or Sentry. API `npm run build` emits nothing, because the root `tsconfig.json` sets `noEmit: true` and `apps/api/tsconfig.json` inherits it. |
| Company sign-up | Closed (`ALLOW_PUBLIC_REGISTRATION`). Fine for a hand-held soft launch: you create each demo company. You need a short runbook or admin script for it. |
| Refresh cookie | `sameSite: 'lax'` (`auth.controller.ts:10`). Web and API must sit on subdomains of one domain (app.x / api.x), or techs get logged out. |
| Messaging | The "on my way" SMS says "Your **Fieldio** technician" (`sms.service.ts:81`). It should use the company name. |

---

## 1. P0: fix before the first demo user

### Field tech app
1. **"On my way" bypasses every safeguard.** `scheduling.service.ts:427-456`, wired from `my-schedule/page.tsx`. It has no check that the job is assigned to the caller and no backwards-status guard, so it can push a COMPLETED job back to EN_ROUTE and text the customer. It doesn't start the TRAVEL clock, has no stale-replay check, and returns a 400 for van-crew jobs. Route it through the normal `PATCH /jobs/:id/status` path.
2. **Pause doesn't work.** My Schedule sends `PAUSED` (`my-schedule/page.tsx:295`). The status enum rejects it (`jobs.controller.ts:7`), and `isBackwardsTransition` would treat it as terminal anyway. Builders and "back tomorrow with the part" jobs need a real **Pause / Leave site for the day** state. Without one, the ON_SITE clock runs overnight until the 12h auto-cut flags it.
3. **The customer SMS drops the tracking link and never has an ETA, and nothing sends GPS.**
   - `notification.service.ts:108-111` builds the message with the link, then calls `sendJobEnRoute(…, payload.eta)` without it. No caller passes an ETA.
   - No web code calls `POST /tracking/ping` (no geolocation anywhere), so `/track` and the dispatch map never move.
   - Either add foreground geolocation pings while EN_ROUTE, or stop promising "live tracking".
4. **A CoC never reaches the customer.**
   - Submissions are stored as JSON only: no PDF, not in the job summary PDF, not on the office job page, no "send to customer".
   - Templates can't be edited (only the "required" flag toggles).
   - The form builder lacks signature, photo and repeating-row fields.
   - The only starter template is plumbing.

   This is the feature SA electricians and plumbers will ask about first. See §3.
5. **Status buttons lock when the phone has signal bars but no data.** `navigator.onLine` stays true, so the mutation keeps retrying instead of pausing. `isPending && !isPaused` keeps Arrive and Complete disabled (`job-detail.tsx:189`, `technician-home.tsx:98`, `providers.tsx:86`). Add a request timeout so it falls back to the offline queue.

### Office job handling
6. **Office can't complete a job without faking field events.** The job detail page only offers En Route, then On Site, then Complete (`jobs/[id]/page.tsx:412-450`). Clicking them texts the customer "on my way" and "started", and writes TRAVEL/WRENCH time for the tech. That breaks the no-manual-timesheet rule and embarrasses the demo. Add **Mark complete (office)** with no customer messages and no clock, and hide the field buttons for office roles.
7. **Notification settings switch nothing off.** `renderNotificationForEvent` (`modules/notifications/notification-templates.ts`) has no caller outside tests. `notifyCustomer` sends hardcoded SMS/WhatsApp regardless of settings, while the settings page says "off by default". Wire in the gate or hide the page.
8. **Quick create can't find customers beyond the 100 most recent.** The page asks for `limit=200` and filters on the client, but the API caps at 100 (`customers.controller.ts:8`). Customer 101 onward gets duplicated, and "New job" from a customer page fails to preselect. Use server-side search in the picker.
9. **A voided invoice blocks re-invoicing the job forever.** `Invoice.jobId` is `@unique` and `createFromJob` throws if any invoice exists, including VOID (`invoices.service.ts:49`). With no invoice edit, one typo means the job can never be billed. Allow a new invoice when the existing one is VOID. Deposits are a bigger schema change, see §2.
10. **Job line items stay editable after invoicing**, by office or tech (`jobs.service.ts:379`, `:480`). The job and the invoice then disagree. Lock them once a live invoice exists.
11. **Cross-tenant link in quick create.** `existingCustomerId` is never checked against the caller's company (`jobs.service.ts:1081`). `vanId` and `projectId` aren't validated in create, update or quickCreate, and estimate `create` doesn't check `customerId`.

### Dispatch
12. **The tech is never told about work assigned or moved from the board.** `updateSchedule` only emits a company socket event (`scheduling.service.ts:353-360`). Drag, drop, reassign and suggest-tech send nothing to the tech. There is no Web Push or SMS to techs anywhere, and the tech app doesn't listen for `schedule:updated`. Minimum fix: `notifyUser` plus an SMS/WhatsApp to the tech, and a socket-driven refetch in the tech app.
13. **Jobs with no end time break conflict detection and vanish from the tech's week.**
    - Quick create and booking-convert store `scheduledEnd: null`.
    - The conflict check only runs when both start and end exist (`scheduling.service.ts:303`), and `getMyWeek` filters on `scheduledEnd` (`:219`).
    - Result: silent double-booking and missing jobs. Default the end to start plus the template or company default duration.

---

## 2. P1: needed in the first weeks of real use

**Field**
- **Queue loss on logout or expired session.** A 401 refresh logs out and reloads, then the no-op persister overwrites IndexedDB, so queued signatures, notes and forms are lost (`api.ts:45,96`, `providers.tsx:37-42`). Manual logout does the same without a warning. Cached customer data also stays on the device after logout (POPIA).
- **"Required for completion" is company-wide.** One required CoC blocks every dripping-tap job, and blocks every tech without `canIssueCoC` (`digital-forms.service.ts:218-235`). Make it per job type or template.
- **"Finish" on My Schedule opens the office `/jobs/:id` page**, not the field closeout flow (`my-schedule/page.tsx:302,318`).
- **Failed (4xx) outbox items vanish on reload.** Photos rejected with a 403 are retried forever (`use-photos.ts:104-122`).
- **Multi-day jobs** show as "Overdue" from day 2 (`types.ts:216`).

**Office**
- **"Generate invoice"** shows on CANCELED and REQUESTED jobs, with no error toast. `updateStatus` errors are silent too.
- **Booking convert** has no CONVERTED guard, so a double-click duplicates the customer, site and job (`bookings.controller.ts:54-107`). It never matches an existing customer.
- **Reschedule** sends no "your booking moved" message, writes no audit row, and doesn't reset `reminder24hSentAt`/`reminder1hSentAt`, so the new time gets no reminder.
- **Quote to job** accepts DRAFT or DECLINED quotes, picks the first site, and is titled "Job from Estimate #ab12cd" (`estimates.service.ts:305-357`).
- **Jobs list** search only covers the loaded page of 25. There is no date or tech filter and no CANCELED tab. The branch filter persisted in localStorage gives a permanently empty list, because no job ever gets a `branchId`.
- **`PATCH /:id/status` with CANCELED** skips the cancel reason and invoice checks, so techs can cancel their own jobs.
- **Job costing margin is wrong.** It subtracts material *sell* price and double-counts receipt expenses, with no cost price on line items and no labour cost (`jobs.service.ts:586-603`). Hide margin until it is right; a builder will spot it.
- **Quick create** sends no booking confirmation; the full create does.
- **CoC/forms** aren't shown on the office job page.

**Dispatch**
- **Van-crew conflicts aren't checked on write.** A tech can be double-booked through their van (`scheduling.service.ts:314-327`).
- **Public booking widget** is a free `datetime-local` with no slots or business hours. 02:00 on Sunday is accepted.
- **No leave or unavailability model**, so techs on leave show "Available".
- **The schedule board** still hard-codes 06:00–20:00, doesn't use business hours, has no click-a-slot to create a job, and drops always land as 1 hour (or 00:00 in month view).
- **`onMyWay` / `tech:location`** is broadcast to the whole company room, techs included (POPIA).

**Hide for the soft launch:** Projects (can't be created: `projects/page.tsx:54-66` posts an empty customer). Also hide anything else in the 14 extra modules that a demo user might switch on.

---

## 3. Competitor parity: what each trade will ask in a demo

| Rank | Gap | Electrician | Plumber | Builder | Who has it |
|---|---|---|---|---|---|
| 1 | **Certificate PDF emailed to the customer**: SANS 10142-1 electrical CoC with per-circuit test table (insulation resistance, earth continuity, loop impedance, RCD trip time), registration no.; PIRB plumbing CoC with photo evidence | ●●● | ●●● | ○ | ServCraft, simPRO |
| 2 | **Multi-visit / multi-day jobs** with pause/resume and a daily log | ●● | ●● | ●●● | Fergus, Tradify, simPRO, ServCraft |
| 3 | **Tech-lanes dispatch board** (day = tech columns, week = tech rows), click slot to create | ●●● | ●●● | ●● | All six |
| 4 | **Tech notified on assign/move** (push or SMS); job list updates live | ●●● | ●●● | ●● | ServiceM8, Tradify, Jobber |
| 5 | **Deposits and progress invoicing / several invoices per job** (blocked by `Invoice.jobId @unique`) | ● | ● | ●●● | Fergus, simPRO, Tradify |
| 6 | **On-my-way SMS with live ETA link** | ●● | ●● | ○ | ServiceM8, Jobber |
| 7 | **Variations / change orders** from site | ○ | ○ | ●●● | Fergus, simPRO |
| 8 | **Real job costing**: cost price, labour cost, quoted vs actual | ● | ● | ●●● | Fergus, simPRO |
| 9 | **Photo fields in forms** (DB board before/after, geyser plate) | ●● | ●● | ● | All |
| 10 | **Follow-up / duplicate job** button | ●● | ●● | ● | ServiceM8, Tradify |
| 11 | **Server-side job search** and "completed, not invoiced" view | ●● | ●● | ●● | All |
| 12 | **Self-serve sign-up and trial** | — | — | — | All (not needed for a hand-held soft launch) |

●●● = asked in almost every demo · ○ = rarely

**Positioning for the soft launch:** lead with **plumbers and electricians**, where 1, 3, 4 and 6 are a few weeks of work. Hold builders until multi-visit jobs, deposits and variations exist. Today builders will compare you to Fergus/simPRO and you'll lose on 2, 5, 7 and 8.

---

## 4. Demo strengths (lead with these)

- **Offline that actually works.** Actions replay in order with idempotency keys and real tap times. Stale "arrived" SMS is suppressed. The outbox has retry and discard. Photos and receipts are stored safely offline and resized on the phone (3–8 MB down to about 400 KB). It's built for load-shedding and basements, and is better than most competitors.
- **Techs never see prices**, stripped server-side everywhere (35 tests). Owners love this.
- **No timesheets.** Job status drives the clock, techs can't add or edit hours, and the office corrects with an audit trail.
- **Completion gated** on checklist, signature and required forms, in the client and server-side.
- **One-tap invoice plus pay link** from site with no amounts shown to the tech. A job summary PDF goes to the customer on closeout.
- **SA-native:** ZAR, 15% VAT, SAST, no VAT if not registered, gap-free tax invoice numbering, buyer VAT number, WhatsApp-first with SMS fallback, `en-ZA` dictation.
- **Van / crew dispatch**, smart tech suggestion (skills, conflicts, crews), 409 on clashes, fullscreen wall board, 24h/1h customer reminders.
- **Phone-first tech home:** Up Next card, Google Maps and Waze, call customer, today's route, installable PWA (Android plus iOS hint), site history at the address.

---

## 5. Recommended path to soft launch

| Week | Work |
|---|---|
| **0** | Commit the current working tree in named chunks. Finish or park the in-flight schedule rebuild, keeping `tsc` and `next build` green. |
| **1: trust the loop** | P0 1, 2, 5, 6, 7, 9, 10, 11, 12, 13. Mostly small, contained fixes: on-my-way through the status path, a real PAUSED state, office complete, notification gate, void then re-invoice, line-item lock, tenancy checks, notify the tech on move, default end times. |
| **2: the demo wow** | P0 3 and 4: GPS pings while EN_ROUTE plus the ETA link with the company name, CoC PDF (electrical SANS 10142-1 and PIRB templates, photo and signature fields, send to customer, shown on the job). Server-side customer picker (P0 8). Wire in the tech-lanes board. |
| **3: go-live** | API build output and a Dockerfile, HTTPS on one parent domain, nightly DB backups, Sentry, and a runbook for creating a demo company. Then a real-phone airplane-mode test. |
| **Then** | 2–3 friendly plumbing and electrical firms on a parallel run. Builders after multi-visit jobs, deposits and variations (P1 schema work). |

---

## Resolution status: week 1 (2026-11-24, uncommitted)

The week-1 fixes are in. API suite: 624/624. `tsc` is clean for API and web, and the web unit and schedule tests pass. One reviewer pass was done (Opus 5.5), and its "fix first" items are resolved. **Not yet checked in a browser or on a real phone.**

| P0 | Status | What changed |
|---|---|---|
| 1 On my way | Fixed | Guarded: the job must be the tech's or their van's, and terminal statuses get 409. It delegates to `jobsService.updateStatus` (clock, token, stale check, one message). My Schedule uses the offline status mutation. |
| 2 Pause | Fixed | PAUSED is accepted: ON_SITE→PAUSED→EN_ROUTE/ON_SITE/COMPLETED. Pausing closes the clock and sends no message. Tech buttons are "Leave site for today" and "Resume" / "I'm on site". There is no repeat "arrived" text on the same day. Paused and on-site jobs are never Overdue. |
| 3 Tracking SMS | Partly | The SMS now carries the tracking link and the company name. **Still open:** GPS pings from the phone and an ETA (week 2). |
| 4 CoC PDF | Open | Week 2. |
| 5 Locked buttons | Fixed | 15s timeout on field requests. Buttons are no longer disabled while pending, and the FIFO queue keeps taps in order. 1s double-tap guard. The field lists refetch once when the queue drains, driven by the MutationCache. |
| 6 Office complete | Fixed | `POST /jobs/:id/complete` sends no customer messages and creates no time entries. "Mark complete" is on the office job page, and the field buttons there are tech-only. |
| 7 Notification gate | Fixed | Master switch plus a per-event flag, both default ON. Edited templates are rendered. Placeholders that can't be filled were removed. |
| 8 Customer picker | Fixed | Server-side debounced search, and preselect via `GET /customers/:id`. |
| 9 Void → re-invoice | Mitigated | `POST /invoices/:id/resync-from-job` for DRAFT invoices with no payments and no credit notes. The VOID error now explains itself. A cancelled job can't be invoiced. Real re-invoicing needs `Invoice.jobId` to stop being `@unique`, which belongs to the deposits/progress invoicing schema work. |
| 10 Line-item lock | Fixed | Returns 409 once the invoice is past DRAFT. |
| 11 Tenancy | Fixed | quickCreate customer, vanId and projectId; estimate customer/project, plus zod parsing. Quote convert: SENT or APPROVED only, an atomic claim (no duplicate jobs), idempotency, and a readable title. |
| 12 Tech told of moves | Fixed (in-app) | `notifyUser` on assign, reassign and move (crew included). The tech app refreshes live over the socket and shows a toast. **Still open:** Web Push or SMS when the app is closed. |
| 13 Null end | Fixed | End defaults to start + the template duration or 60 min. Overlap queries catch null-end and multi-day jobs. Conflict checks (including van crews) run on create, quickCreate, the board and booking convert. |

Also fixed (P1):
- Booking convert is idempotent.
- Reminders reset on reschedule.
- `/status` CANCELED is rejected.
- "Generate invoice" shows only on COMPLETED jobs, with toasts.
- Quick create sends the booking confirmation (`JOB_BOOKED`).
- PAUSED appears on the board, roster, analytics and the job filters.

Still open from the reviewer:
- Company socket events (including customer details) reach every tech. They should go to the assigned tech or crew only.
- `fakePrisma` ignores `OR`/`AND`/`NOT`.
