# Project Findings & Research

## Discovery
- **North Star**: Production-Ready v1 (Web-Only MVP) Field Service Web App for plumbing companies.
- **Integrations**: Stripe, QuickBooks (webhooks), Google Maps/Leaflet, Resend/Twilio, Socket.io.
- **Source of Truth**: PostgreSQL (Neon/Local) + Prisma.
- **Delivery**: Docker Compose (Local) -> Cloud (Vercel/Fly/Railway).
- **Behavior**: Reliable, Strict Validation, Mobile-First (PWA), Real-Time.

## Research Checklist
- [ ] Review `DesignPrinsipals` directory for UI patterns.
- [ ] Confirm API key availability (Stripe, Maps, Resend, Twilio).

## Constraints
- **Tech Stack**: Next.js 15, Express (Backend), Prisma, Postgres, TypeScript, Tailwind.
- **Architecture**: Monorepo or separate FE/BE (Plan: Monorepo with Turborepo recommended by prompt).
- **Rules**: Data-First, No guessing logic, Update SOPs on logic change.
