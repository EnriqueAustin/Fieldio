# Gemini Protocol: Project Constitution

## 📜 Behavioral Rules
1.  **Reliability Over Speed**: Deterministic logic is preferred over probabilistic guesses.
2.  **Data-First Rule**: Define JSON Data Schema (Input/Output shapes) before coding tools.
3.  **Self-Healing**: Analyze -> Patch -> Test -> Update Architecture SOPs.
4.  **No Logic Guessing**: If business logic is unclear, halt and ask.
5.  **Strict Validation**: Input sanitization (Zod) and output verification are mandatory.
6.  **Security First**: All data access must be scoped by `companyId`. RBAC middleware on all routes.

## 🏗️ Architectural Invariants
-   **Frontend**: Next.js 15 (App Router, Server Actions/Components), Tailwind, Shadcn/UI, Zustand, TanStack Query.
-   **Backend**: Express (TypeScript), Socket.io (Real-time), BullMQ (Queues).
-   **Database**: PostgreSQL + Prisma ORM.
-   **Infrastructure**: Docker Compose (Local), Monorepo (Turborepo).
-   **Security**: JWT (HttpOnly Cookie), Rate Limiting, Helmet, Zod Validation.

## 💾 Data Schema (Master)

### Core Entities

#### Company (Tenant)
- `id`: UUID
- `name`: String
- `settings`: JSON (Branding, Modules, Localization)
- `createdAt`: DateTime
- `updatedAt`: DateTime

#### User
- `id`: UUID
- `companyId`: UUID (Relation to Company)
- `email`: String (Unique)
- `passwordHash`: String
- `role`: Enum (ADMIN, DISPATCHER, OFFICE, TECHNICIAN)
- `permissions`: JSONOrArray (Specific caps e.g., 'job:read')
- `avatarUrl`: String
- `status`: Enum (ACTIVE, INACTIVE, INVITED)

### CRM

#### Customer
- `id`: UUID
- `companyId`: UUID
- `name`: String
- `email`: String
- `phone`: String
- `notes`: Text
- `status`: Enum (ACTIVE, LEAD, ARCHIVED)

#### Property
- `id`: UUID
- `customerId`: UUID
- `companyId`: UUID
- `addressLine1`: String
- `addressLine2`: String
- `city`: String
- `state`: String
- `zip`: String
- `geoLat`: Float
- `geoLng`: Float

### Work Management

#### Job
- `id`: UUID
- `companyId`: UUID
- `customerId`: UUID
- `propertyId`: UUID
- `techId`: UUID (Nullable, Relation to User)
- `status`: Enum (REQUESTED, ASSIGNED, EN_ROUTE, ON_SITE, COMPLETED, CANCELED)
- `priority`: Enum (LOW, MEDIUM, HIGH, EMERGENCY)
- `title`: String
- `description`: Text
- `scheduledStart`: DateTime
- `scheduledEnd`: DateTime
- `actualStart`: DateTime
- `actualEnd`: DateTime
- `lineItems`: Relation<JobLineItem[]>
- `checklist`: Relation<JobChecklist[]>

#### JobLineItem
- `id`: UUID
- `jobId`: UUID
- `name`: String
- `description`: String
- `quantity`: Float
- `unitPrice`: Decimal
- `total`: Decimal
- `type`: Enum (SERVICE, MATERIAL, LABOR)

### Finance

#### Estimate
- `id`: UUID
- `companyId`: UUID
- `customerId`: UUID
- `jobId`: UUID (Optional)
- `status`: Enum (DRAFT, SENT, APPOVED, DECLINED, EXPIRED)
- `items`: JSON (Snapshot of line items)
- `total`: Decimal
- `validUntil`: DateTime
- `pdfUrl`: String

#### Invoice
- `id`: UUID
- `companyId`: UUID
- `jobId`: UUID
- `status`: Enum (DRAFT, SENT, PAID, PARTIAL, OVERDUE, VOID)
- `subtotal`: Decimal
- `tax`: Decimal
- `total`: Decimal
- `balance`: Decimal
- `dueDate`: DateTime
- `stripePaymentId`: String

### Operations

#### InventoryItem
- `id`: UUID
- `companyId`: UUID
- `name`: String
- `sku`: String
- `quantity`: Int
- `minLevel`: Int (Alert threshold)
- `location`: Enum (WAREHOUSE, VAN)
- `assignedUserId`: UUID (If in Van)

#### Notification
- `id`: UUID
- `companyId`: UUID
- `userId`: UUID
- `type`: Enum (SYSTEM, JOB_ASSIGNED, MENTION, ALERT)
- `title`: String
- `message`: Text
- `readAt`: DateTime

#### AuditLog
- `id`: UUID
- `companyId`: UUID
- `userId`: UUID
- `action`: String
- `entityId`: UUID
- `entityType`: String
- `metadata`: JSON
