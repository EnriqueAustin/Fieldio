import { Router } from 'express';
import { supplierController } from '../modules/suppliers/suppliers.controller';
import { purchaseOrderController } from '../modules/purchase-orders/purchase-orders.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const supplierRouter = Router();

supplierRouter.use(requireUser);

// Suppliers
supplierRouter.get('/', catchAsync(supplierController.getAll));
supplierRouter.post('/', catchAsync(supplierController.create));
supplierRouter.get('/:id', catchAsync(supplierController.getOne));
supplierRouter.patch('/:id', catchAsync(supplierController.update));

// Purchase Orders
supplierRouter.get('/purchase-orders/all', catchAsync(purchaseOrderController.getAll));
supplierRouter.post('/purchase-orders', catchAsync(purchaseOrderController.create));
supplierRouter.get('/purchase-orders/:id', catchAsync(purchaseOrderController.getOne));
supplierRouter.patch('/purchase-orders/:id', catchAsync(purchaseOrderController.update));
