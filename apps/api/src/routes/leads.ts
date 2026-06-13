import { Router } from 'express';
import { leadsController } from '../modules/leads/leads.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const leadsRouter = Router();
leadsRouter.use(requireUser);

leadsRouter.get('/pipeline', catchAsync(leadsController.pipeline));
leadsRouter.patch('/:id/stage', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'), catchAsync(leadsController.setStage));
leadsRouter.get('/sources', catchAsync(leadsController.sources));
leadsRouter.post('/sources', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.createSource));
leadsRouter.delete('/sources/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.deactivateSource));
leadsRouter.get('/funnel', catchAsync(leadsController.funnel));
