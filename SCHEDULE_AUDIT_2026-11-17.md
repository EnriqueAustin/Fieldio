# Schedule / Dispatch Center audit — 2026-11-17

Scope: `/schedule` page ([page.tsx](apps/web/src/app/(dashboard)/schedule/page.tsx)), its components in
`apps/web/src/components/schedule/`, and the API behind it
([scheduling.service.ts](apps/api/src/modules/scheduling/scheduling.service.ts), `routes/scheduling.ts`).
This is a code-level audit. I couldn't log in to the demo seed (login failed against the local DB), so I didn't check anything in a running browser.

**Verdict: about 45/100.** The basic flow works: drag onto the calendar, get a 409 on a clash, revert. But the page has real data bugs, and its layout doesn't match how a dispatcher works.

---

## 1. What the page is today

One 791-line client component that loads 7 endpoints with no error handling and renders:

| Block | Component | State |
|---|---|---|
| 4 KPI tiles | `OpsCard` (inline) | Two of the four show wrong numbers |
| Unscheduled list (left) | `UnscheduledJobsPanel` | Lists jobs that are already done or already scheduled |
| Calendar (centre) | FullCalendar week/day/month | Plain calendar with no per-tech lanes |
| Live map (right) | `DispatchMap` | Fake SVG scatter plot, not a map |
| Tech availability (right) | inline | Wrong when you leave the current week |
| Van teams (right) | inline | Read-only, OK |
| Recurring plans form + list (right) | inline | Doesn't belong on this page, fails silently |
| Assign dialog | `ReassignDialog` | Shifts the job's time by 2 hours on the drop flow |
| Suggest-tech modal | `TechSuggestModal` | No error handling, no conflict check, doesn't refresh the board |
| `ScheduleSidebar` | — | **Dead code** (imported nowhere, "Stub" text) |

The biggest UX problem is that **a dispatcher thinks in technicians, but the board shows time only.**
You can't see who is doing what without clicking each event. Event titles are "Job – Customer" with no
tech name and no status colour (only blue for assigned and grey for unassigned). Completed and cancelled jobs look the same as live ones.

---

## 2. Bugs: wrong data or broken behaviour

### P0
1. **Drag from Unscheduled, then Assign, moves the job 2 hours earlier (SAST).**
   `onExternalDrop` passes `start.toISOString()` (UTC) to `ReassignDialog`, which does `.slice(0,16)` into a
   `datetime-local` input, so 10:00 shows as 08:00. On save, `new Date("…T08:00")` is read as local time and the job
   is saved at 08:00 SAST. Clicking an existing event works, because FullCalendar's `startStr` carries the offset.
   [page.tsx:345-351](apps/web/src/app/(dashboard)/schedule/page.tsx:345), [reassign-dialog.tsx:59-64](apps/web/src/components/schedule/reassign-dialog.tsx:59)
2. **`POST /schedule/jobs` is a mass-assignment and cross-tenant write.** The controller passes `req.body` straight in
   (the Zod schema is never parsed), and the service does `{ companyId, ...input }`, so a body `companyId` overrides the
   caller's company. Arbitrary columns go through too. Nothing in the web app calls it, but it is live for ADMIN, OFFICE and DISPATCHER.
   [scheduling.service.ts:103-115](apps/api/src/modules/scheduling/scheduling.service.ts:103), [scheduling.controller.ts:66](apps/api/src/modules/scheduling/scheduling.controller.ts:66)
3. **`PATCH /schedule/jobs/:id` doesn't validate its input.** `updateJobScheduleSchema` is defined but never `.parse()`d.
   `techId` and `vanId` aren't checked to belong to the company, or to be an active TECHNICIAN or an active van, so you can
   assign another tenant's user id. A bad date string becomes `Invalid Date` and a 500. `end < start` is accepted.
   [scheduling.service.ts:163-235](apps/api/src/modules/scheduling/scheduling.service.ts:163)

### P1
4. **"Suggest tech → Assign" skips the conflict check.** It sends only `{ techId }`, and the overlap check runs only when
   both times are in the body. The modal also has no error toast (a 409 does nothing visible), invalidates a
   `schedule-events` query that doesn't exist (the calendar uses `useState`), so the board doesn't refresh, and leaves
   jobs with no time in "Unscheduled" as ASSIGNED.
   [tech-suggest-modal.tsx:32-40](apps/web/src/components/schedule/tech-suggest-modal.tsx:32)
5. **The Unscheduled list includes COMPLETED and CANCELED jobs.** Its `OR` (no tech, *or* no start, *or* REQUESTED) has
   no status filter. It also lists REQUESTED jobs that are already on the calendar, so the same job shows in both places.
   [scheduling.service.ts:32-49](apps/api/src/modules/scheduling/scheduling.service.ts:32)
6. **Unassigning leaves the status as ASSIGNED.** There is no revert to REQUESTED.
   [scheduling.service.ts:220-225](apps/api/src/modules/scheduling/scheduling.service.ts:220)
7. **The "Unassigned jobs" KPI counts van-assigned jobs as unassigned** (it filters on `techId` only). It also counts the
   visible calendar range, while the panel next to it counts something else, so the two numbers disagree.
   [page.tsx:254](apps/web/src/app/(dashboard)/schedule/page.tsx:254)
8. **Tech availability is computed from the calendar's visible range.** Move to next week and every tech becomes
   "Available", because today's jobs are no longer loaded. Van-crew jobs are ignored, and a tech with no GPS ping shows "Offline" even with jobs booked.
   [page.tsx:260-283](apps/web/src/app/(dashboard)/schedule/page.tsx:260)
9. **Every GPS ping reloads 6 endpoints.** `tech:location` is emitted on *every* ping (not throttled; only
   persistence is throttled) and triggers `refreshOperations()`: users, tracking, recurring, 100 customers, all properties,
   and vans. With 10 techs pinging, that is a constant request storm.
   [page.tsx:198-200](apps/web/src/app/(dashboard)/schedule/page.tsx:198), [tracking.controller.ts:39](apps/api/src/modules/tracking/tracking.controller.ts:39)
10. **Likely duplicate event after an external drop.** FullCalendar keeps the "received" event *and* the refetched
    one from the `events` prop. Call `info.event.remove()` after the refresh. (I couldn't confirm this in a browser.)
11. **The map draws every job line from `techPoints[0]`**, so jobs look like they belong to the wrong tech. It isn't a
    map at all (no tiles or roads, just normalised points on a grid), and only techs with an active job appear.
    [dispatch-map.tsx:67-70](apps/web/src/components/schedule/dispatch-map.tsx:67)

### P2
12. The week starts on Sunday in FullCalendar (no `firstDay`), but bootstrap fetches a Monday week, so the first load runs
    twice with different ranges. The "Week range" tile is wrong in month view, and its shield icon means nothing.
13. Hours are hard-coded to `06:00–20:00`, ignoring the company **business hours** setting that already exists. There is no `businessHours` shading.
14. `selectable` is on, but there is no `select` handler, so dragging out a slot does nothing. "New scheduled job" opens `/jobs/quick` without prefilling the slot.
15. A drop in month view schedules the job at 00:00. External drops are always 1 hour long.
16. Completed and cancelled events are draggable and only fail on the server's 409. They should be `editable:false` and greyed out.
17. If any of the 7 bootstrap calls fails, `Promise.all` rejects with no catch: the page goes blank or stays half-loaded, with no message.
    The "Loading dispatch data…" text renders at the *bottom* of a ~1400px page, where nobody sees it.
18. The recurring plan form returns silently when a field is missing, has no error toast (only `finally`), caps customers at
    100 and loads *all* properties. There is no deactivate button (the API has `DELETE`). The "Recurring due — ready to generate"
    tile has no generate action (generation is cron-only). `StatusPill` is misused, with ON_SITE meaning "due".
19. Pressing Esc to close a dialog also exits fullscreen, because a global keydown listener runs alongside the dialog's own Esc handling.
20. The page opens its own socket instead of using the shared `lib/socket.ts`. The Unscheduled panel ignores sockets and polls every 30s.
21. Names show as the email prefix (`sipho`) everywhere except the assign dialog, even though `firstName` and `lastName` exist.
22. Hard-coded `bg-white`, `bg-slate-50`, `emerald-50` and `bg-black/30` break dark mode. `TechSuggestModal` is a hand-rolled overlay
    (no Esc, no focus trap, no `role="dialog"`) while `ReassignDialog` uses the real `Dialog`.
23. `suggestTechs` doesn't filter `deletedAt`, runs one count query per tech (N+1), and ignores van membership, distance and leave.
24. No tests cover `updateSchedule`, `getUnscheduled` or `suggestTechs`, apart from `jobs.integrity.test.ts` touching the route.

---

## 3. Layout and UX: why it feels wrong

- **It does too many jobs on one page.** Dispatch board, fake map, roster, van list *and* a recurring-plan admin form are all on
  one page. On a laptop the right column is 4 stacked cards, and the plan form pushes everything down.
- **The calendar isn't a dispatch board.** Competitors such as ServCraft and Jobber show *technician rows × time* (or tech columns
  for a day). Here you schedule a time first, then pick a tech in a modal. That is two steps and you can't see capacity.
- **The roster is disconnected from the board.** You can't drag onto a tech, filter the calendar to one tech, or click a tech to see their day route
  (the API already has `/schedule/my-route?techId=`).
- **The KPI tiles are noise.** Two are wrong, and "Week range" isn't a KPI.
- **There's no detail on hover or click.** Clicking an event jumps straight into the reassign dialog. There is no quick view (customer, address,
  status, phone) and no "open job" link.

---

## 4. Recommended rebuild (in order)

1. **Fix the P0 and P1 bugs first** (items 1–9). They are small, well-contained changes. Add Zod parsing and company-scoping on both write endpoints.
2. **Make the board tech-first.** Day view = one column per tech or van, week view = tech rows. FullCalendar's
   `resourceTimeline` and `resourceTimeGrid` are **premium (paid licence)**. The alternatives are a light custom lane grid, or
   keeping the current FullCalendar view and adding a tech filter plus tech-coloured events as a stop-gap.
3. **Show status in events:** colour by status, show the tech or van name, show the address on hover, and grey out completed and cancelled events (not editable).
4. **Use one data layer:** move everything to React Query with keys the socket handlers invalidate. Read `tech:location` to update marker
   positions in place, not refetch the world. Use the shared socket.
5. **Move recurring plans** to their own page (`/recurring`, or under Memberships) with list, create, deactivate and "generate now".
6. **Map:** use a real tile map (Leaflet + OSM, free), one line per tech to *their* job, or remove it until it's real.
7. **Make the roster useful:** derive it from a dedicated `/schedule/roster?date=` (today, regardless of the visible range,
   including van jobs). Click a tech to filter the board and show the route.
8. Use the company business hours, set `firstDay: 1`, add a `select` → quick-create job prefilled with slot and tech, and delete `schedule-sidebar.tsx`.
