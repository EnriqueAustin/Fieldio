# Fieldio - Field Service Management Platform

Fieldio is a modern, full-stack Field Service Management (FSM) application designed for plumbing, HVAC, and electrical service businesses. It enables dispatchers to schedule jobs, technicians to manage work in the field, and admins to track revenue and inventory.

![Fieldio Dashboard](https://placeholder-image-url.com/dashboard-preview.png)

## 🚀 Key Features

*   **Multi-Role Experience**: 
    *   **Admin/Dispatcher Web Portal**: Calendar scheduling, customer CRM, job management, invoices.
    *   **Technician mobile View**: "En Route" status updates, checklists, photo uploads.
*   **Real-Time Engine**: Socket.io powered updates for instant job status changes across devices.
*   **Notification System**: Automated Email and SMS alerts for customers (e.g., "Technician is 15 mins away").
*   **Inventory Management**: Track parts on trucks and in the warehouse.
*   **SaaS Ready**: Multi-tenant architecture (Company/User model) with per-tenant data isolation.

## 🛠 Tech Stack

### Monorepo Structure (Turborepo)
*   `apps/web`: **Next.js 15 (App Router)**, Tailwind CSS, Shadcn/UI, Zustand, TanStack Query.
*   `apps/api`: **Express.js**, TypeScript, Zod, Prisma ORM, Socket.io, Redis (optional).
*   `packages/database`: Shared Prisma schema and client.
*   `packages/ui`: Shared UI components.

### Infrastructure
*   **Database**: PostgreSQL
*   **Cache/Queue**: Redis
*   **Containerization**: Docker & Docker Compose

## 🏁 Quick Start

### Prerequisites
*   Node.js 18+
*   Docker Desktop (for DB/Redis)

### 1. Clone & Install
```bash
git clone https://github.com/antiGravityDev/Fieldio.git
cd Fieldio
npm install
```

### 2. Start Infrastructure
Start PostgreSQL and Redis. Make sure Docker Desktop is running first on Windows.
```bash
npm run infra:up
```

### 3. Database Setup
Initialize the database and seed it with demo data:
```bash
npm run db:migrate
npm run db:seed
```

### 4. Run Development Server
Start both the Frontend (localhost:3000) and Backend (localhost:3001):
```bash
npm run dev
```

If login fails with `Can't reach database server at localhost:5432`, PostgreSQL is not running yet. Start Docker Desktop, rerun `npm run infra:up`, and then run the migration/seed steps above.

### 5. Login
Access **http://localhost:3000**.
*   **Email**: `admin@fieldio.com`
*   **Password**: `password123`

## 📖 Documentation
*   [API Reference](docs/API.md)
*   [User Guide](docs/USER_GUIDE.md)

## 🛡 Security
*   **RBAC**: Role-Based Access Control (Admin, Dispatcher, Technician).
*   **Rate Limiting**: Protects API endpoints from abuse.
*   **Data Isolation**: All database queries are scoped to `companyId`.

## 🤝 Contributing
1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

---
Built with ❤️ by the Fieldio Team.
