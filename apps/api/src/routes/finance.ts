import { Router } from 'express';
import { estimateController } from '../modules/estimates/estimates.controller';
import { invoiceController } from '../modules/invoices/invoices.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const financeRouter = Router();

financeRouter.use(requireUser);

// Estimates
financeRouter.post('/estimates', catchAsync(estimateController.create));
financeRouter.get('/estimates', catchAsync(estimateController.getAll));
financeRouter.get('/estimates/:id', catchAsync(estimateController.getOne));
financeRouter.post('/estimates/:id/convert', catchAsync(estimateController.convertToJob));

// Invoices
financeRouter.post('/jobs/:jobId/invoice', catchAsync(invoiceController.createFromJob));
financeRouter.get('/invoices', catchAsync(invoiceController.getAll));
financeRouter.get('/invoices/:id', catchAsync(invoiceController.getOne));
financeRouter.post('/invoices/:id/send', catchAsync(invoiceController.send));
