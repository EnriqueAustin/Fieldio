import { Router } from 'express';
import { estimateController } from '../modules/estimates/estimates.controller';
import { invoiceController } from '../modules/invoices/invoices.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const financeRouter = Router();

financeRouter.use(requireUser);

// Estimates
financeRouter.post('/estimates', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.create));
// Field quoting: technicians (and office) build a price-book-driven quote on site.
financeRouter.post('/estimates/field', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(estimateController.createFromField));
financeRouter.get('/estimates', catchAsync(estimateController.getAll));
financeRouter.get('/estimates/:id', catchAsync(estimateController.getOne));
financeRouter.post('/estimates/:id/approve', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.approveWithSignature));
financeRouter.post('/estimates/:id/convert', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.convertToJob));

// Estimate Options
financeRouter.post('/estimates/:id/options', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.addOption));
financeRouter.get('/estimates/:id/options', catchAsync(estimateController.getOptions));
financeRouter.post('/estimates/:id/options/:optionId/accept', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.acceptOption));

// Invoices
financeRouter.post('/jobs/:jobId/invoice', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.createFromJob));
financeRouter.get('/invoices', catchAsync(invoiceController.getAll));
financeRouter.get('/invoices/:id', catchAsync(invoiceController.getOne));
financeRouter.get('/invoices/overdue', catchAsync(invoiceController.getOverdue));
financeRouter.post('/invoices/:id/send', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.send));
financeRouter.post('/invoices/:id/reminder', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.sendReminder));
financeRouter.post('/invoices/bulk-reminder', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.sendBulkReminders));
financeRouter.delete('/invoices/:id', restrictTo('ADMIN'), catchAsync(invoiceController.softDelete));
