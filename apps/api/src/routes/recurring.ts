import { Router } from 'express';
import { recurringController } from '../modules/recurring/recurring.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const recurringRouter = Router();
recurringRouter.use(requireUser);
recurringRouter.get('/', catchAsync(recurringController.list));
recurringRouter.post('/', catchAsync(recurringController.create));
recurringRouter.delete('/:id', catchAsync(recurringController.deactivate));
