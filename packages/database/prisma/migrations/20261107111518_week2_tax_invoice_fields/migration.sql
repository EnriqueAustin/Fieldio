-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "invoiceSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "subtotal" DECIMAL(65,30),
ADD COLUMN     "tax" DECIMAL(65,30),
ADD COLUMN     "taxLabel" TEXT,
ADD COLUMN     "taxRate" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerVatNumber" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- Backfill: continue each company's invoice series after its highest existing number.
UPDATE "Company" c SET "invoiceSequence" = COALESCE((
    SELECT GREATEST(
        COALESCE(MAX(substring(i."invoiceNumber" from '(\d+)$')::int), 0),
        COUNT(*)::int
    )
    FROM "Invoice" i WHERE i."companyId" = c."id"
), 0);

-- Backfill buyer snapshot on existing invoices from the job's customer.
UPDATE "Invoice" i SET "customerName" = cu."name"
FROM "Job" j JOIN "Customer" cu ON cu."id" = j."customerId"
WHERE j."id" = i."jobId" AND i."customerName" IS NULL;
