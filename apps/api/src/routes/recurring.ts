import { Router } from 'express';
import { recurringController } from '../modules/recurring/recurring.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const recurringRouter = Router();
recurringRouter.use(requireUser);
// Recurring plans carry priced templates — office/sales/accounting only, never TECHNICIAN.
recurringRouter.get('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'), catchAsync(recurringController.list));
recurringRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(recurringController.create));
recurringRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(recurringController.deactivate));
