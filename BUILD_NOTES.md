# Fieldio v2 — Phase 1 Build Notes

This pass closes the table-stakes gaps vs. Housecall Pro / Jobber / ServiceTitan.

## What was added

### Database (Prisma schema)
- `Payment` model with status / method / Stripe IDs
- `Invoice.publicToken`, `paidAt`, `stripeCheckoutSessionId`
- `JobPhoto`, `JobSignature`
- `UserLocationPing` (technician GPS history)
- `NotificationLog` (email/SMS delivery audit trail)
- `RecurringPlan` (maintenance contracts) + `Job.recurringPlanId`
- `BookingRequest` (public service-request inbox)

### Backend (apps/api)
- **Stripe payments** — `services/stripe.service.ts`, `modules/payments/*`, `routes/payments.ts`
  - `POST /webhooks/stripe` (raw-body, mounted before json middleware)
  - `GET /public/payments/invoices/:token` — customer-facing invoice
  - `POST /public/payments/invoices/:token/checkout` — Stripe Checkout session
  - `GET /payments/invoices/:invoiceId/pay-link` (auth)
  - `POST /payments/invoices/:invoiceId/record` — manual cash/check (auth)
  - Webhook updates invoice balance + status, fires `invoice:paid` socket event
- **Real email** — `services/notifications/email.service.ts` now uses Resend with HTML templates; falls back to log-only when no API key
- **Real SMS** — `services/notifications/sms.service.ts` now uses Twilio; same fallback
- Both write delivery rows to `NotificationLog`
- **Photo uploads** — `services/storage.service.ts` (S3/R2 compatible), `modules/jobs/photos.controller.ts`, `routes/jobPhotos.ts`. Uses `sharp` for EXIF strip + thumbnails.
  - `POST /media/jobs/:jobId/photos` (multipart, field=`photo`)
  - `GET /media/jobs/:jobId/photos`
  - `DELETE /media/photos/:photoId`
- **GPS tracking** — `modules/tracking/*`, `routes/tracking.ts`
  - `POST /tracking/ping` — technician device pings location (throttled, broadcasts via socket)
  - `GET /tracking/latest` — dispatcher view, latest ping per tech
- **Customer booking portal** — `modules/bookings/*`, `routes/bookings.ts`
  - `POST /public/bookings/:companyId` — public form submission
  - `GET /bookings`, `POST /bookings/:id/convert` (auth) — convert to customer + property + REQUESTED job
- **Recurring plans** — `modules/recurring/*`, `routes/recurring.ts`
  - In-process scheduler runs every 10 min, generates due jobs idempotently
  - `GET /recurring`, `POST /recurring`, `DELETE /recurring/:id`
- **Invoice send** — `POST /finance/invoices/:id/send` now actually emails the customer with a pay link.

### Frontend (apps/web)
- `/pay/[token]` — public customer pay page, hits Stripe Checkout
- `/book/[companyId]` — public service-request form

### Config
- `apps/api/src/config/env.ts` extended with Stripe, Resend, Twilio, S3/R2, Mapbox vars (all optional — services degrade to dev-stub mode when keys absent)
- `.env.example` at repo root

## Required next steps to run

```bash
# 1. Configure env
cp .env.example .env  # fill in keys you have; leave others blank

# 2. Start local infra (Docker Desktop must be running)
npm run infra:up

# 3. Generate Prisma client + migration
npm run db:migrate
npm run db:seed

# 4. Stripe webhook (dev)
stripe listen --forward-to localhost:3001/webhooks/stripe
# copy the whsec_... into STRIPE_WEBHOOK_SECRET

# 5. Run
npm run dev   # from repo root (turbo)
```

If Prisma reports that it cannot reach `localhost:5432`, the Docker daemon or PostgreSQL container is not running yet.

## What's intentionally still pending (Phase 2+)

- **Dispatcher map UI** — backend GPS endpoints are live; React Mapbox/Leaflet component still needs to be added to the schedule page.
- **QuickBooks sync** — not started.
- **Native technician app** — PWA still the only mobile target.
- **Reporting depth** — current dashboard is KPI cards; AR-aging / utilization reports not yet built.
- **Two-way SMS inbox** — outbound only.
- **Estimate public approve/decline page** — pattern is identical to `/pay/[token]`; trivial follow-up.
- **PDF generation for invoices/estimates** — `pdfUrl` fields exist on the models but no generator wired yet.
- **Test coverage** — no new Playwright tests added; recommend covering the pay flow first.

## Architectural notes

- All third-party services (Stripe / Resend / Twilio / S3) check for keys lazily and either succeed or return a clear "not configured" 503. Dev environment runs without any keys.
- Stripe webhook is mounted **before** `express.json()` so the raw body is preserved for signature verification. Don't move it.
- The recurring scheduler is in-process for simplicity. Move to BullMQ + Redis (already in docker-compose) before running multiple API instances.
- `NotificationLog` is best-effort; failures to write a log don't block message sending.
- `UserLocationPing` writes are throttled to one per 30s per user to keep the table small; live broadcasts still go out on every ping.
