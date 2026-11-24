import { Router } from 'express';
import { estimateController } from '../modules/estimates/estimates.controller';
import { invoiceController } from '../modules/invoices/invoices.controller';
import { paymentsController } from '../modules/payments/payments.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';

export const financeRouter = Router();

financeRouter.use(requireUser);

// Quote/invoice reads carry prices and balances: every role except TECHNICIAN.
// The field console only uses the price-free POST /estimates/field and /field-invoice.
const officeRead = restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT');

// Estimates
financeRouter.post('/estimates', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.create));
// Field quoting: technicians (and office) build a price-book-driven quote on site.
financeRouter.post('/estimates/field', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), idempotency, catchAsync(estimateController.createFromField));
financeRouter.get('/estimates', officeRead, catchAsync(estimateController.getAll));
financeRouter.get('/estimates/:id', officeRead, catchAsync(estimateController.getOne));
financeRouter.post('/estimates/:id/send', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.send));
financeRouter.post('/estimates/:id/decline', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.decline));
financeRouter.post('/estimates/:id/approve', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.approveWithSignature));
financeRouter.post('/estimates/:id/convert', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), idempotency, catchAsync(estimateController.convertToJob));

// Estimate Options
financeRouter.post('/estimates/:id/options', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.addOption));
financeRouter.get('/estimates/:id/options', officeRead, catchAsync(estimateController.getOptions));
financeRouter.post('/estimates/:id/options/:optionId/accept', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(estimateController.acceptOption));

// Invoices
financeRouter.post('/jobs/:jobId/invoice', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(invoiceController.createFromJob));
// Field closeout money step: a technician can invoice their own job and send the
// pay link on site. Assignment + price-stripping are enforced in the service/controller.
financeRouter.post('/jobs/:jobId/field-invoice', restrictTo('ADMIN', 'OFFICE', 'TECHNICIAN'), idempotency, catchAsync(invoiceController.sendFieldInvoice));
financeRouter.get('/invoices', officeRead, catchAsync(invoiceController.getAll));
financeRouter.get('/invoices/overdue', officeRead, catchAsync(invoiceController.getOverdue));
financeRouter.get('/invoices/uninvoiced-jobs', restrictTo('ADMIN', 'OFFICE'), catchAsync(invoiceController.getUninvoicedJobs));
// Bulk invoice generation from selected completed-uninvoiced jobs.
financeRouter.post('/invoices/bulk-generate', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(invoiceController.bulkGenerate));
financeRouter.get('/invoices/:id', officeRead, catchAsync(invoiceController.getOne));
// Tax invoice PDF — same office roles as the reads (never TECHNICIAN).
financeRouter.get('/invoices/:id/pdf', officeRead, catchAsync(invoiceController.pdf));
financeRouter.post('/invoices/:id/send', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(invoiceController.send));
// Rebuild a DRAFT invoice from the job's current line items (keeps the number).
financeRouter.post('/invoices/:id/resync-from-job', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), idempotency, catchAsync(invoiceController.resyncFromJob));
// Void: keeps the number, kills the pay link. Refused once a payment is recorded.
financeRouter.post('/invoices/:id/void', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), idempotency, catchAsync(invoiceController.void));
financeRouter.post('/invoices/:id/reminder', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(invoiceController.sendReminder));
financeRouter.post('/invoices/bulk-reminder', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(invoiceController.sendBulkReminders));
// NOTE: there is no DELETE for invoices. Void (which keeps the number on record)
// is the only legal way to cancel an invoice — a hard/soft delete would hide the
// number from the issued series and every export.

// Bulk EFT payment recording (G-3): office reconciles a cleared bank batch.
// bulk-match is a dry run; bulk-record applies the confirmed matches.
financeRouter.post('/payments/bulk-match', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), idempotency, catchAsync(paymentsController.bulkMatch));
financeRouter.post('/payments/bulk-record', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), idempotency, catchAsync(paymentsController.bulkRecord));
