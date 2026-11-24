# Menu & Navigation Audit — 2026-11-16

Scope: every menu entry in `apps/web/src/lib/nav-config.ts` across all 7 roles, every
route under `app/(dashboard)`, the settings tab strip, and the mobile nav / account
sheet. Judged against ServCraft and the wider field-service field (Jobber, Housecall
Pro, ServiceTitan).

## What is already at or above parity

- **Nav breadth and role shaping.** 7 distinct role menus (ADMIN, DISPATCHER, OFFICE,
  CSR, SALES, ACCOUNTANT, TECHNICIAN) with grouped sections. Optional features are
  module-gated (`filterNavGroups`) and hidden until switched on in company settings, so
  a small plumber doesn't see a ServiceTitan-sized menu. This is better shaped than
  ServCraft's single flat menu.
- **Mobile nav is sound.** The bottom bar carries the 4–5 most-used destinations per
  role and `account-sheet.tsx` carries the entire sidebar overflow plus sign-out, so no
  role is stranded on a phone. This was a previously-reported gap and it is closed.
- **Global search** in the topbar is real (debounced, hits `/search`, click-through to
  customers / jobs / invoices).
- **Deep core pages.** `jobs/[id]` (1314 lines), `customers/[id]` (900), `schedule`
  (791), `my-schedule` (724), `settings/price-book` (717), `forms` (636),
  `time-tracking` (620), `vans` (562) are all substantial, not shells.
- **Recurring / maintenance plans** exist and are wired into the schedule page.

## Status: all 8 scheduled gaps closed (uncommitted)

Verified independently of the workers' own claims: `apps/api` tsc exit 0, `apps/web`
tsc clean, **480 API tests across 43 files pass**, web suite 9/9 (incl. 6 new CSV
tests). 40 files touched, nothing committed.

Settings went from 4 tabs to 7: Company · Team · **Branches** · **Business Hours** ·
**Notifications** · Price Book · My Account. No Prisma migration was needed anywhere.

## Gaps found — now fixed

| # | Menu | Problem | Severity |
|---|------|---------|----------|
| 1 | Settings › Business Hours | Hardcoded preview, "Coming soon" banner, Save disabled, not even in the settings tab strip. Also gates valid slots in the public booking widget. | P0 |
| 2 | Settings › Notifications | Same — preview only, nothing saves. Automated customer notifications are a headline competitor selling point; the messaging plumbing already exists (dunning proves it). | P0 |
| 3 | Finance › Credit Notes | List-only. **Nothing in the app can create a credit note**, so the page is permanently empty and its Issue/Apply buttons are unreachable. SARS-relevant for SA trades. | P0 |
| 4 | Everywhere | **No CSV export anywhere.** The only CSV code in the repo is the customer *import* template. Reports especially — the owner's accountant works in Excel/Sage. | P0 |
| 5 | Leads | No way to create a lead; no lead-source config (yet the ROI panel's empty state asks for sources, with no route to add them); no WON → quote/job conversion; no edit; subtitle promises drag-and-drop that doesn't exist; only 3 of the 5 other stages offered per card. Pipeline with no entrance and no exit. | P0 |
| 6 | (no menu entry) Branches | `routes/branches.ts` has full ADMIN CRUD. The web app only *consumes* branches (jobs filter, team assignment). No screen creates one — so on a fresh company the filter never appears and multi-location is dead. | P1 |
| 7 | Permits / Certifications | Create flows require pasting a raw UUID — `placeholder="Paste job ID"` and `"User ID of the technician"`. Unusable in practice. | P1 |
| 8 | Finance › Statements | Builds and emails, but no view/download, and no month-end "all customers with a balance" batch. | P1 |

## Follow-ups surfaced by the fix pass — ranked

1. **Credit-note `apply` has four money bugs** (pre-existing, found while wiring
   creation; reported not fixed, deliberately). `creditNotesService.apply`: (a) does not
   require `status === 'ISSUED'`, so a DRAFT with an `invoiceId` can be applied straight
   through the API; (b) has **no guard against a VOID invoice** — balance 0 means
   applying a credit flips a void invoice to PAID; (c) creates **no `Payment` row**
   despite its own comment saying it does, so the credit never appears in the invoice's
   Payments list; (d) computes `newBalance` with raw `Number` subtraction, no `round2`,
   so repeated ops drift cents. (b) and (c) sit squarely in the territory of the last
   money commit (`fix(money): payment reversal, no payments on void, honest reports`) —
   the same class of bug, one module over. **Highest priority.**
2. **Public booking widget ignores business hours entirely.** There is no slot
   generation at all: `book/[companyId]/page.tsx` is a free-form `datetime-local` and
   `bookingsController.submit` validates only that the string is a datetime. A customer
   can request 02:00 on a Sunday. Needs a server-side guard in `submit` (the endpoint is
   unauthenticated, so that is the real enforcement point) plus a public hours read for
   the widget to constrain the picker. Business hours now exist to enforce against.
3. **Leads board renders two columns that can never hold a card.** `pipeline` filters
   `status: 'LEAD'`, but moving to WON sets `status: ACTIVE` and LOST sets `ARCHIVED`,
   so cards vanish on drop. Pre-existing `setStage` semantics. Competitors keep won/lost
   visible for the period. Needs a decision on lead status semantics, not a patch.
4. **Jobs index is thin for a dispatch tool** — see below; unchanged by this pass.
5. **Credit-note numbering is not atomic.** Kept as a `CN-` series derived from existing
   rows with a `@@unique([companyId, number])` backstop and retry. Invoices use an
   atomic `Company.invoiceSequence`; matching that needs a `Company.creditNoteSequence`
   column (schema migration).
6. **`GET /branches` returns active only** — the new management screen therefore cannot
   show or reactivate a deactivated branch. Needs an `includeInactive` param.
7. **`ProtectedRoute` is given no `allowedRoles`** anywhere in `(dashboard)/layout.tsx`.
   Investigated and it is **not** a pricing leak — `financeRouter` reads use `officeRead`
   (excludes TECHNICIAN), `analyticsRouter` restricts to ADMIN/OFFICE/ACCOUNTANT,
   `flatRateRouter` excludes TECHNICIAN, and `price-book.service.ts:60`
   `hidePricesForTech` strips `unitPrice`/`costPrice` for techs by design. A technician
   typing `/invoices` gets 403s and a dead page: a UX bug, worth fixing, not a leak.

## Gaps found — reported, not yet scheduled

- **Jobs index is thin for a dispatch tool.** Search is page-local only
  ("Search *this page*"), no date-range filter, no column sort, no bulk
  select → assign / reschedule / change status, no saved views. ServCraft and all three
  US competitors have bulk actions and server-side search on this screen. This is the
  highest-value remaining item.
- **Backends with no UI at all:** `inventoryTransfers` (van ↔ warehouse stock
  transfers, full CRUD), `markupRules` (pricing markup incl. a `/calculate` endpoint),
  `documents` (job/customer document library, full CRUD). All three are finished
  server-side and completely unreachable from any menu.
- **Calls log is a CSR dead end.** Read-only table; the customer name isn't a link, and
  there is no "create job from this call" or "log outcome" — the two things a CSR does
  after every call.
- **Job templates** can be created and deleted but not edited, and the only consumer is
  `jobs/quick`. Not offered from the schedule page's job creation.
- **Settings is 4 tabs** (Company, Team, Price Book, My Account). Beyond the two
  "coming soon" pages, there is no Tax/VAT tab, no job types/tags, no custom fields, and
  no integrations screen.
