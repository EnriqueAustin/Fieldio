-- Phase 2: Remaining audit features
-- Adds: soft deletes, signature URL, review tracking, price book, suppliers, purchase orders,
-- customer portal tokens, WHATSAPP notification channel

-- Soft deletes
ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Job: review request tracking
ALTER TABLE "Job" ADD COLUMN "reviewRequestSentAt" TIMESTAMP(3);

-- JobSignature: S3 URL storage (keep signatureDataUrl nullable for backwards compat)
ALTER TABLE "JobSignature" ADD COLUMN "signatureUrl" TEXT;
ALTER TABLE "JobSignature" ALTER COLUMN "signatureDataUrl" DROP NOT NULL;

-- Notification channel: add WHATSAPP
ALTER TYPE "NotificationChannel" ADD VALUE 'WHATSAPP';

-- Price Book Items
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "type" "LineItemType" NOT NULL DEFAULT 'SERVICE',
    "category" TEXT,
    "sku" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceBookItem_companyId_idx" ON "PriceBookItem"("companyId");
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Suppliers
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "accountNumber" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purchase Order Status Enum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'PARTIAL', 'CANCELED');

-- Purchase Orders
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "jobId" TEXT,
    "orderNumber" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "expectedDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseOrder_companyId_idx" ON "PurchaseOrder"("companyId");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrder_jobId_idx" ON "PurchaseOrder"("jobId");
CREATE UNIQUE INDEX "PurchaseOrder_companyId_orderNumber_key" ON "PurchaseOrder"("companyId", "orderNumber");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Customer Portal Tokens
CREATE TABLE "CustomerPortalToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerPortalToken_token_key" ON "CustomerPortalToken"("token");
CREATE INDEX "CustomerPortalToken_token_idx" ON "CustomerPortalToken"("token");
CREATE INDEX "CustomerPortalToken_customerId_idx" ON "CustomerPortalToken"("customerId");

ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
