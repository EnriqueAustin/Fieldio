import { Router } from 'express';
import { customerNoteController } from '../modules/customer-notes/customer-notes.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const customerNoteRouter = Router();

customerNoteRouter.use(requireUser);

customerNoteRouter.get('/customer/:customerId', catchAsync(customerNoteController.getByCustomer));
customerNoteRouter.get('/customer/:customerId/timeline', catchAsync(customerNoteController.getTimeline));
customerNoteRouter.post('/', catchAsync(customerNoteController.create));
customerNoteRouter.put('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(customerNoteController.update));
customerNoteRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(customerNoteController.delete));
