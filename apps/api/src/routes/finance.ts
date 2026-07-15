import { Router } from 'express';
import { estimateController } from '../modules/estimates/estimates.controller';
import { invoiceController } from '../modules/invoices/invoices.controller';
import { paymentsController } from '../modules/payments/payments.controller';
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
financeRouter.post('/estimates/:id/send', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.send));
financeRouter.post('/estimates/:id/decline', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.decline));
financeRouter.post('/estimates/:id/approve', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.approveWithSignature));
financeRouter.post('/estimates/:id/convert', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.convertToJob));

// Estimate Options
financeRouter.post('/estimates/:id/options', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.addOption));
financeRouter.get('/estimates/:id/options', catchAsync(estimateController.getOptions));
financeRouter.post('/estimates/:id/options/:optionId/accept', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.acceptOption));

// Invoices
financeRouter.post('/jobs/:jobId/invoice', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.createFromJob));
// Field closeout money step: a technician can invoice their own job and send the
// pay link on site. Assignment + price-stripping are enforced in the service/controller.
financeRouter.post('/jobs/:jobId/field-invoice', restrictTo('ADMIN', 'OFFICE', 'TECHNICIAN'), catchAsync(invoiceController.sendFieldInvoice));
financeRouter.get('/invoices', catchAsync(invoiceController.getAll));
financeRouter.get('/invoices/overdue', catchAsync(invoiceController.getOverdue));
financeRouter.get('/invoices/uninvoiced-jobs', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.getUninvoicedJobs));
// Bulk invoice generation from selected completed-uninvoiced jobs.
financeRouter.post('/invoices/bulk-generate', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.bulkGenerate));
financeRouter.get('/invoices/:id', catchAsync(invoiceController.getOne));
financeRouter.post('/invoices/:id/send', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.send));
financeRouter.post('/invoices/:id/reminder', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.sendReminder));
financeRouter.post('/invoices/bulk-reminder', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.sendBulkReminders));
financeRouter.delete('/invoices/:id', restrictTo('ADMIN'), catchAsync(invoiceController.softDelete));

// Bulk EFT payment recording (G-3): office reconciles a cleared bank batch.
// bulk-match is a dry run; bulk-record applies the confirmed matches.
financeRouter.post('/payments/bulk-match', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(paymentsController.bulkMatch));
financeRouter.post('/payments/bulk-record', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(paymentsController.bulkRecord));
