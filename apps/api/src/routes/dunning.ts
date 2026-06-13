import { Router } from 'express';
import { dunningController } from '../modules/dunning/dunning.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const dunningRouter = Router();
dunningRouter.use(requireUser);
dunningRouter.get('/rules', catchAsync(dunningController.listRules));
dunningRouter.post('/rules', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(dunningController.createRule));
dunningRouter.patch('/rules/:id', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(dunningController.updateRule));
dunningRouter.delete('/rules/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(dunningController.deleteRule));
dunningRouter.post('/seed', restrictTo('ADMIN'), catchAsync(dunningController.seedDefaults));
dunningRouter.post('/run-now', restrictTo('ADMIN'), catchAsync(dunningController.runNow));
