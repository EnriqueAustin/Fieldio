# Task Plan: Field Service Web App (Production V1)

## Phase 0: Planning & Setup
- [x] **Repository Initialization**
    - [x] Initialize Monorepo (Turborepo) structure: `apps/web`, `apps/api`, `packages/database`, `packages/ui`
    - [x] Configure TypeScript, ESLint, Prettier, Husky (Git hooks)
- [x] **Infrastructure Configuration**
    - [x] Create `docker-compose.yml` for local dev (Postgres, Redis, Adminer)
    - [x] Create `.env` template with strict validation
- [x] **Database Setup**
    - [x] Initialize Prisma in `packages/database`
    - [x] Define initial `schema.prisma` (Company, User, Customer, Job, etc.)
    - [x] Create seed script (`seed.ts`) with demo company and users
- [x] **Design & UX**
    - [x] Review `DesignPrinsipals` for UI patterns (Sleek, Modern, Glassmorphism)
    - [x] Set up Tailwind CSS configuration with variables/tokens

## Phase 1: Infrastructure & DevEnv
- [x] **Backend Foundation**
    - [x] Set up Express app with TypeScript
    - [x] Implement Pino logger
    - [x] Set up global error handling & async wrappers
    - [x] Implement basic Health Check endpoints
- [x] **Frontend Foundation**
    - [x] Initialize Next.js 15 (App Router)
    - [x] Setup TanStack Query & React Query Devtools
    - [x] Setup Zustand for state management
    - [x] Install Shadcn/UI & Radix primitives
    - [x] Verify Docker Compose full stack (FE + BE + DB + Redis) communication

## Phase 2: Auth & RBAC (Security First)
- [x] **Data Models**
    - [x] Refine `User` and `Company` models in Prisma
- [x] **Authentication Flow (API)**
    - [x] Implement Login API (Email/Password, JWT generation)
    - [x] Implement Refresh Token rotation (httpOnly cookie)
    - [x] Implement Registration API (Email verification stub)
    - [x] Implement Forgot Password flow (Planned)
- [x] **Frontend Auth UI**
    - [x] Create Login Page with Zod Validation
    - [x] Create Register Page with Zod Validation
    - [x] Implement `useAuthStore` (Zustand)
    - [x] Implement Axios Client with Token Interceptors
- [x] **Authorization (RBAC)**
    - [x] Create Roles Guard (`restrictTo`) and Auth Guard (`requireUser`)
    - [x] Create Protected Route wrapper (`ProtectedRoute`)
- [x] **New Features Backend**
    - [x] Implement Digital Forms API
    - [x] Implement Estimate Options API
    - [x] Implement Inventory Transfers API
- [ ] **Testing**
    - [ ] Write Auth flow integration tests

## Phase 3: Company, User & Team Management
- [x] **Settings API**
    - [x] Update Company Profile (Name, Branding)
    - [x] User CRUD operations (Invite, Update Role, Deactivate)
- [x] **Frontend Pages**
    - [x] `/settings/company`: Company profile form
    - [x] `/settings/users`: User list and invite modal
    - [x] `/profile`: User's own profile settings
- [x] **Data Scoping**
    - [x] Ensure ALL queries are scoped by `companyId` (Tenant isolation)

## Phase 4: Customer CRM
- [x] **Data Models**
    - [x] Refine `Customer` and `Property` models
- [x] **API**
    - [x] CRUD endpoints for Customers
    - [x] CRUD endpoints for Properties
    - [x] Implement Search/Filtering
- [x] **Frontend Pages**
    - [x] `/customers`: DataTable with search/filters
    - [x] `/customers/[id]`: Profile view (Contact, Properties tab)
    - [x] `/customers/new`: Create Customer + Property wizard

## Phase 5: Scheduling & Calendar (Core Feature)
- [x] **Calendar Integration**
    - [x] Install FullCalendar (Day/Week/Month views)
    - [x] Implement TimeGrid and Interaction plugins
- [x] **Scheduling Logic**
    - [x] Create `SchedulingService` for fetching Events
    - [x] Implement Drag-and-Drop handlers
    - [x] Implement Resize handlers
- [x] **Technician Dispatch**
    - [x] Sidebar: List available technicians
    - [x] Visual indicators for Unassigned Jobs pool
- [ ] **Real-Time Map Stub**
    - [ ] Integrate Leaflet/React-Leaflet
    - [ ] Show tech locations (mocked or real) on map sidebar
- [x] **WebSockets**
    - [x] Setup Socket.io Server `SocketService`
    - [x] Real-time updates (job:created, schedule:updated) reflected in UI

## Phase 6: Job Management Core
- [x] **Data Models**
    - [x] Refine `Job`, `JobLineItem`, `JobChecklist` models
    - [x] Add `JobStatus` enum (REQUESTED -> COMPLETED)
- [x] **Job Workflow**
    - [x] `JobsService`: Handle status updates & audit logs
    - [x] `/jobs`: Advanced DataTable with Status Badges
    - [x] `/jobs/[id]`: The "Command Center" UI
        - [x] Overview Tab
        - [x] Checklist Tab (Toggleable items)
        - [x] Photos Tab (Placeholder)
- [x] **Technician View (Mobile Optimized)**
    - [x] Action Buttons (En Route -> On Site -> Complete)
    - [x] Responsive layout stacks on mobile

## Phase 7: Estimates, Invoices & Payments
- [x] **Estimating**
    - [x] Create `Estimate` model logic in `EstimateService`
    - [x] "Convert to Job" workflow (Copies items)
- [x] **Invoicing**
    - [x] Create `InvoiceService` with `createFromJob` logic (Snapshots items)
    - [x] Updated Frontend: "Generate Invoice" functionality in Job Detail
- [ ] **Payments (Stripe)**
    - [ ] Setup Stripe Node SDK
    - [ ] Implement Checkout Session creation
    - [ ] Handle Webhooks (Payment Success -> Update Invoice Status)

## Phase 8: Inventory & Expenses
- [x] **Inventory System**
    - [x] Create `InventoryItem` model (Stock, Van allocation)
    - [x] `/inventory`: Stock list and low-stock alerts
    - [x] API: Create, Update Quantity
- [x] **Expenses**
    - [x] `Expense` model and relation to Job
    - [x] API: Log expense per job
    - [x] Frontend: Expenses Tab in Job Detail

## Phase 9: Notifications & Real-Time
- [x] **Socket.io Implementation**
    - [x] Real-time status updates (Job chaned -> UI toast)
    - [x] "Technician En Route" events
- [x] **Multi-Channel Notifications**
    - [x] Backend Services: `EmailService` (Stub), `SmsService` (Stub), `NotificationService` (Dispatcher)
    - [x] Triggers: Job Status (En Route/Completed) -> SMS/Notification
    - [x] Frontend: `NotificationBell` with Toast alerts

## Phase 10: Reporting & Analytics
- [x] **Dashboard API**
    - [x] Aggregated stats: Revenue, utilization, job counts
    - [x] `/analytics/dashboard` endpoint and logic.
- [x] **Frontend Dashboards**
    - [x] Admin: Revenue KPI, Active Jobs KPI, Active Technicians list.
    - [x] Recent Activity Feed.

## Phase 11: Admin/Settings, Polish & PWA
- [x] **Advanced Settings**
    - [x] Price Book editor
    - [x] Notification Templates editor
    - [x] Business Hours config
- [x] **PWA Features**
    - [x] Add `manifest.json`
    - [x] Configure Service Workers for offline fallback (IndexedDB sync stub)
- [x] **UI Polish**
    - [x] Sidebar navigation updates.
    - [ ] Ensure "Sleek, Elegant, Modern" aesthetic (Glassmorphism, Animations)
    - [ ] Verify Mobile responsiveness implementation

## Phase 12: Testing & Security
- [x] **Security Hardening**
    - [x] Rate Limiting (express-rate-limit)
    - [x] Input Sanitization (Zod everywhere)
    - [ ] Helmet/CORS config
    - [ ] OWASP Scan
- [x] **E2E Testing**
    - [x] Playwright Setup
    - [x] Happy Path Test Suite written.

## Phase 13: Documentation & Handover
- [x] **Docs**
    - [x] API Swagger/OpenAPI docs (Simplified to API.md)
    - [x] User Guides (Markdown)
    - [x] Developer README (Setup, Architecture)
- [ ] **Demo Data**
    - [ ] Demo seeds for "Day 1" experience

## Phase 14: Final Deployment
- [ ] **Production Build**
    - [ ] Docker production target optimization
    - [ ] Deploy to Cloud provider (simulated or actual)
- [ ] **Final Verification**
    - [ ] Full system walkthrough
