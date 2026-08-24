# Tech Field View — Mobile Simplicity Audit (2026-07-17)

**Method:** Logged in as technician `sipho@aquaflow.co.za` on a 375×812 (iPhone-class) viewport and drove the full field workflow end-to-end: home console → job selection → Work tab (checklist, line items, expenses) → Media tab (notes, photos) → Done tab (timer, signature, summary, invoice/pay-link) → My Schedule → Van Stock → Inbox. DOM-level measurements (tap-target sizes, scroll height, overflow) taken on every screen, cross-checked against source in `apps/web/src/components/dashboard/technician/*`.

**Benchmarks:** ServiceTitan Mobile, Housecall Pro, Jobber app, ServCraft field app. All four share the same shape: **the tech opens the app, sees today's jobs in time order, taps one, and gets a focused single-job screen with 3–5 giant buttons for the loop (dispatch → drive → arrive → work → get signed → done). Everything is 1–2 taps, thumb-reachable, camera-first.**

**Verdict: 58/100 for field-tech mobile UX.** The plumbing underneath is genuinely competitive (offline queue, status flow, checklist+signature gating, price hiding, pay-link closeout — several of these *beat* ServCraft). But the presentation layer is a desktop dashboard squeezed to 375px, with several outright mobile bugs. A tech with gloves on, in the sun, on a 3-year-old Android, will fight this UI.

---

## What's already strong (keep)

| Area | Why it's good |
|---|---|
| Status flow | One primary button per state (`Start route` → `Arrive on site` → `Complete job`), auto customer comms per step — simpler than ServiceTitan's equivalent |
| Completion gating | Can't complete without full checklist + signature; clear amber warning |
| Price hiding | Items/qty only for techs, stripped server-side — unique differentiator |
| Offline | IndexedDB photo queue, persisted query cache, resumable mutations — ahead of ServCraft |
| Closeout money step | Send invoice + pay link in one tap, no amounts shown to tech |
| Signature pad | Proper pointer events, `touch-none`, works on touch |
| Bottom nav | 4 labelled thumb targets, correct per role |

---

## Findings (ranked)

### P0 — blockers for real field use

**1. The home screen is one 6,173-pixel scroll.** Everything renders on a single page: header copy → "Up next" card → 3 progress cards → quick actions → **all 17 job cards** → then the *entire* active-job detail (header, tabs, checklist, line items, expenses). Tapping a job in the list silently swaps content ~4,000px further down — the tech sees nothing happen. Every top platform separates **list screen → job screen**. This is the single biggest gap.
*Fix:* Mobile-first two-screen flow. Home = today's jobs (time-ordered, grouped Today / Overdue / Upcoming). Tap → focused job screen (route or full-screen slide-in) with a **sticky bottom action bar** holding the primary status button so it's always thumb-reachable.

**2. Line items can't be deleted on a phone.** The delete button is `opacity-0 group-hover:opacity-100` and 14×14px ([line-items-card.tsx:120](apps/web/src/components/dashboard/technician/line-items-card.tsx:120)) — hover doesn't exist on touch, so the control is invisible and untappable. A tech who fat-fingers the wrong part **cannot undo it**.
*Fix:* always-visible delete (≥44px hit area) or swipe-to-delete.

**3. No forms / CoC in the field view.** The forms module, `requiresCoc` templates, and per-user `canIssueCoC` all exist, but the tech console has zero surface to open, fill, or submit a form on site. For SA plumbing (geyser CoC on the spot) this is a legal-workflow blocker; ServiceTitan/Jobber both have on-site forms.
*Fix:* Forms card in the Work tab — required forms listed with status, tap to fill (mobile-friendly renderer), completion gated when a required CoC is unsubmitted.

**4. Photo capture is desktop-shaped.** Bare `<input type="file" accept="image/*">` (no `capture`), single file only, then a caption field and a separate **Upload** button. Competitors: tap camera → shoot → auto-attach; multi-select from gallery; before/after tags.
*Fix:* Two big buttons — **Take photo** (`capture="environment"`) and **Add from gallery** (`multiple`) — auto-queue on selection (offline queue already exists), caption optional after the fact.

**5. My Schedule is a 7-column week grid at 375px.** FullCalendar `timeGridWeek` default ([my-schedule/page.tsx:161](apps/web/src/app/(dashboard)/my-schedule/page.tsx:161)) gives ~44px-wide day columns — unreadable, and the details panel says "Click any event." Every competitor defaults mobile to a **day/agenda list**.
*Fix:* agenda-list default below `md`, day-grid toggle, week grid desktop-only.

### P1 — high friction

**6. "Assigned today" is neither today nor ordered.** It lists all 17 open jobs of any date, unsorted, without address, date, or priority. `priority` (incl. `EMERGENCY`) exists in the payload but is **never rendered**. Techs can't tell what's next or what's urgent.
*Fix:* group by Today / Overdue / Upcoming, sort by scheduled time, show suburb + time + priority badge (emergency = red).

**7. Tap targets below the 44px floor everywhere.** Tabs 32px, primary buttons 40px, price-book result rows ~38px, inputs 38px. Each is marginal; together they make the whole app feel fiddly with work gloves.
*Fix:* mobile-size variants — controls ≥44–48px in the tech console.

**8. Labor timer reads "829:29:25".** `LiveTimer` runs from `actualStart` forever (month-old seed job). No pause, no sanity cap, only visible in the Done tab.
*Fix:* cap display (>24h → "since {date}"), surface a compact timer chip in the job header, allow pause/adjust or office correction.

**9. Van Stock is a read-only 489px-wide table in a 375px viewport.** No way to decrement stock used on a job, request a restock, or count stock. Competitors treat truck stock as an active workflow.
*Fix:* card list on mobile with +/- adjust, "used on job", low-stock badge, one-tap restock request.

**10. Prime screen space is spent on prose.** "Field workflow for sipho — Live assigned jobs, completion steps, and customer-ready handoff from one screen." plus a global search that includes invoices (techs can't see invoices). The first thing a tech needs — next job + one button — is below the fold on load.
*Fix:* compact header (name + date + offline chip), search scoped to jobs/customers, "Up next" card first with Start route inline.

### P2 — polish

11. Tabs (`Work / Media / Done`) reset scroll context and hide the checklist while signing; consider one scrollable job screen with anchored sections, or keep tabs but persist per-tab scroll.
12. No pull-to-refresh affordance (30s poll only).
13. Expenses form always expanded — collapse behind an "Add expense" button.
14. Notes save button below textarea, small; no voice-note (Jobber has audio notes — nice-to-have).
15. Photo grid rows ~248px tall with caption cards — heavy; use a tight thumbnail grid + lightbox.

---

## Competitive scorecard (field-tech app only)

| Capability | Fieldio | ServiceTitan | Housecall Pro | Jobber | ServCraft |
|---|---|---|---|---|---|
| Focused per-job mobile screen | ❌ mega-scroll | ✅ | ✅ | ✅ | ✅ |
| Today-ordered job list | ❌ | ✅ | ✅ | ✅ | ✅ |
| One-tap status + auto customer comms | ✅ | ✅ | ✅ | ✅ | ✅ |
| Camera-first photos | ❌ | ✅ | ✅ | ✅ | ✅ |
| On-site forms / CoC | ❌ | ✅ | ⚠️ | ✅ | ⚠️ |
| Checklist gating | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Signature on device | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice + pay link from field | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline-first | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Price hiding from techs | ✅ | ⚠️ config | ❌ | ❌ | ❌ |
| Truck/van stock actions | ❌ read-only | ✅ | ❌ | ❌ | ❌ |
| Mobile day-agenda schedule | ❌ week grid | ✅ | ✅ | ✅ | ✅ |

**Net:** the *loop logic* is at parity or better; the *screen architecture and touch ergonomics* are 2 generations behind. All fixes are frontend-weight, no schema changes needed except form submissions surfacing.

---

## Build plan (agents)

- **Agent A — Field console mobile rebuild (P0 #1,2,4 + P1 #6,7,8,10 + P2):** two-screen flow, sticky action bar, touch targets, camera-first photos, job-list grouping/priority, timer fix, header declutter.
- **Agent B — My Schedule + Van Stock mobile (P0 #5 + P1 #9):** agenda default on mobile; van stock card UI with adjust/use/restock (API additions as needed).
- **Agent C — Field forms & CoC (P0 #3):** tech-facing forms API surface + mobile form-fill card, CoC gating on completion, `canIssueCoC` respected.

---

## Resolution status (updated 2026-08-24)

All three agent workstreams landed, plus the follow-up hardening below. `apps/web`
and `apps/api` typecheck clean; the API suite is 102 green (22 new).

**Done — P0:** #1 two-screen flow, #2 always-visible line-item delete, #3 forms/CoC
(tech-facing `GET /digital-forms/jobs/:jobId/forms`, `canIssueCoC` gate, `requiredForCompletion`
completion gating, offline submit queue), #4 camera-first photos, #5 mobile agenda schedule.
**Done — P1:** #6 grouping/priority, #7 44px targets, #8 24h timer cap, #9 van-stock
card UI with ±steppers + one-tap restock **and** "Use on job" attribution (decrements
stock, writes a job-attributed `AuditLog`, auto-raises a low-stock alert), #10 compact header.
**Done — P2:** #11 tabs reset to the tab bar on switch, #12 pull-to-refresh on the field
home, #13 collapsed expenses, #14 voice-to-text dictation into the notes field.

**Security fix (not in original audit):** global search leaked invoice numbers **and
totals** to technicians with no role check. `searchService.globalSearch` is now role-aware
— techs never receive invoices and their job results are scoped to jobs assigned to them
or their van; the topbar hides the invoices section for techs. Covered by `search.roles.test.ts`.

**New API tests:** `vans.stock.test.ts` (restock + use-on-job guards, de-dupe, cost hiding),
`digital-forms.field.test.ts` (job-access + CoC gating), `search.roles.test.ts` (price hiding).

**Not done:** browser/visual verification of the field screens (needs the full stack — DB,
API, seeded tech+van+jobs — which was not running); e2e coverage for the two-screen flow
(`happy-path.spec.ts` still has no technician selectors); audio-blob voice notes (shipped
dictation instead). Broader repo backlog in `task_plan.md` (Helmet/CORS, OWASP, demo seeds,
prod Docker/deploy) is untouched.
