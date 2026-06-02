-- South Africa market-entry primitives: user names, compliant invoice snapshots,
-- local payment methods, Xero connection state, quote signatures, and property assets.

CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'NEEDS_SERVICE', 'RETIRED');
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'SYNC_ERROR');

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EFT';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYFAST';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "firstName" TEXT,
ADD COLUMN IF NOT EXISTS "lastName" TEXT;

ALTER TABLE "Estimate"
ADD COLUMN IF NOT EXISTS "signerName" TEXT,
ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT,
ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT,
ADD COLUMN IF NOT EXISTS "taxLabel" TEXT NOT NULL DEFAULT 'VAT',
ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 15,
ADD COLUMN IF NOT EXISTS "taxNumber" TEXT,
ADD COLUMN IF NOT EXISTS "supplierName" TEXT,
ADD COLUMN IF NOT EXISTS "supplierCompanyRegistration" TEXT,
ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_companyId_invoiceNumber_key"
ON "Invoice"("companyId", "invoiceNumber");

CREATE TABLE IF NOT EXISTS "PropertyAsset" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installedAt" TIMESTAMP(3),
    "lastServicedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PropertyAsset_companyId_idx" ON "PropertyAsset"("companyId");
CREATE INDEX IF NOT EXISTS "PropertyAsset_propertyId_idx" ON "PropertyAsset"("propertyId");

ALTER TABLE "PropertyAsset"
ADD CONSTRAINT "PropertyAsset_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "XeroConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantName" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "XeroConnection_companyId_tenantId_key"
ON "XeroConnection"("companyId", "tenantId");

CREATE INDEX IF NOT EXISTS "XeroConnection_companyId_idx" ON "XeroConnection"("companyId");

ALTER TABLE "XeroConnection"
ADD CONSTRAINT "XeroConnection_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
