import { Router } from 'express';
import { customerNoteController } from '../modules/customer-notes/customer-notes.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const customerNoteRouter = Router();

customerNoteRouter.use(requireUser);

customerNoteRouter.get('/customer/:customerId', catchAsync(customerNoteController.getByCustomer));
customerNoteRouter.get('/customer/:customerId/timeline', catchAsync(customerNoteController.getTimeline));
customerNoteRouter.post('/', catchAsync(customerNoteController.create));
customerNoteRouter.put('/:id', catchAsync(customerNoteController.update));
customerNoteRouter.delete('/:id', catchAsync(customerNoteController.delete));
