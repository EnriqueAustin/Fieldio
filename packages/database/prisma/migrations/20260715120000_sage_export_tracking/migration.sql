-- Sage export tracking (G-5): nullable columns only, additive/backwards-compatible.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "exportedAt" TIMESTAMP(3),
ADD COLUMN     "exportBatchId" TEXT,
ADD COLUMN     "reconciledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "exportedAt" TIMESTAMP(3),
ADD COLUMN     "exportBatchId" TEXT;
