import { Router } from 'express';
import multer from 'multer';
import { inventoryController } from '../modules/inventory/inventory.controller';
import { expensesController } from '../modules/expenses/expenses.controller';
import { propertyController } from '../modules/properties/properties.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const operationsRouter = Router();

operationsRouter.use(requireUser);

const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

// Inventory
operationsRouter.get('/inventory', catchAsync(inventoryController.getAll));
operationsRouter.post('/inventory', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryController.create));
operationsRouter.patch('/inventory/:id', catchAsync(inventoryController.update));

// Expenses (multipart for receipt)
operationsRouter.post(
    '/jobs/:jobId/expenses',
    restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'),
    receiptUpload.single('receipt'),
    catchAsync(expensesController.create)
);
operationsRouter.get('/jobs/:jobId/expenses', catchAsync(expensesController.getByJob));

// Properties
operationsRouter.get('/properties', catchAsync(propertyController.list));
operationsRouter.get('/property-assets', catchAsync(propertyController.listAssets));
operationsRouter.post('/properties/:propertyId/assets', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(propertyController.createAsset));
operationsRouter.patch('/property-assets/:assetId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(propertyController.updateAsset));
