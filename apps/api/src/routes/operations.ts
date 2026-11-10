import { Router } from 'express';
import multer from 'multer';
import { inventoryController } from '../modules/inventory/inventory.controller';
import { expensesController } from '../modules/expenses/expenses.controller';
import { propertyController } from '../modules/properties/properties.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';

export const operationsRouter = Router();

operationsRouter.use(requireUser);

const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

// Inventory. The controller strips unitCost for technicians and only lets them
// change a van stock count (quantity-only PATCH); metadata edits are office-only.
operationsRouter.get('/inventory', catchAsync(inventoryController.getAll));
operationsRouter.post('/inventory', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryController.create));
operationsRouter.patch('/inventory/:id', catchAsync(inventoryController.update));

// Expenses (multipart for receipt)
operationsRouter.post(
    '/jobs/:jobId/expenses',
    restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'),
    // Field write — offline-queued, so it carries an Idempotency-Key.
    idempotency,
    receiptUpload.single('receipt'),
    catchAsync(expensesController.create)
);
// Expense amounts are costs; techs submit receipts but don't read the ledger back.
operationsRouter.get('/jobs/:jobId/expenses', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'), catchAsync(expensesController.getByJob));

// Properties
operationsRouter.get('/properties', catchAsync(propertyController.list));
operationsRouter.get('/property-assets', catchAsync(propertyController.listAssets));
operationsRouter.post('/properties/:propertyId/assets', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(propertyController.createAsset));
operationsRouter.patch('/property-assets/:assetId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(propertyController.updateAsset));
