import { Router } from 'express';
import { inventoryController } from '../modules/inventory/inventory.controller';
import { expensesController } from '../modules/expenses/expenses.controller';
import { propertyController } from '../modules/properties/properties.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const operationsRouter = Router();

operationsRouter.use(requireUser);

// Inventory
operationsRouter.get('/inventory', catchAsync(inventoryController.getAll));
operationsRouter.post('/inventory', catchAsync(inventoryController.create));
operationsRouter.patch('/inventory/:id', catchAsync(inventoryController.update));

// Expenses (Nested under jobs usually, but simple here)
operationsRouter.post('/jobs/:jobId/expenses', catchAsync(expensesController.create));
operationsRouter.get('/jobs/:jobId/expenses', catchAsync(expensesController.getByJob));

// Properties
operationsRouter.get('/properties', catchAsync(propertyController.list));
