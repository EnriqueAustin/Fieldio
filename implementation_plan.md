# Implementation Plan - Phase 0: Setup & Infrastructure

## Goal
Initialize the Field Service Web App repository with a robust Monorepo structure, Docker infrastructure, and the Data Schema defined in `gemini.md`.

## User Review Required
- **Confirm Data Schema**: Please review `gemini.md` (Updated with AuditLog, Inventory, Notifications).
- **Confirm Architecture**: Turborepo (Apps: web, api; Packages: database, ui, config).

## Proposed Changes

### 1. Repository & Monorepo Init
- Initialize `turborepo` in the root.
- Create workspaces:
    - `apps/web`: Next.js 15 (React 19 RC potentially, or latest stable).
    - `apps/api`: Express + TypeScript.
    - `packages/database`: Prisma setup.
    - `packages/ui`: Shadcn/UI shared component library.
    - `packages/typescript-config`: Shared `tsconfig`.
    - `packages/eslint-config`: Shared linting rules.

### 2. Infrastructure (Docker)
#### [NEW] `docker-compose.yml`
- **Postgres**: Image `postgres:16-alpine`.
- **Redis**: Image `redis:alpine` (For BullMQ).
- **Adminer**: For easy DB viewing.
- **Api**: Dev mode.
- **Web**: Dev mode.

### 3. Database Schema
#### [NEW] `packages/database/prisma/schema.prisma`
- Implement the comprehensive schema from `gemini.md`.
- Include `AuditLog`, `InventoryItem`, `Notification` models.
- Configure relations and indexes (e.g., `@@index([companyId])`).

### 4. Code Quality
- Configure Prettier and ESLint.
- Setup Husky for pre-commit hooks.

## Verification Plan

### Automated Tests
- **Docker Up**: `docker-compose up -d` → All containers healthy.
- **Prisma**: `pnpm db:generate` && `pnpm db:push` → Schema valid and applied to local PG.
- **Build**: `pnpm build` → All apps and packages build without error.
