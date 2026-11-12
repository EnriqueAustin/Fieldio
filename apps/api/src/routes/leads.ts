import { Router } from 'express';
import { leadsController } from '../modules/leads/leads.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const leadsRouter = Router();
leadsRouter.use(requireUser);

// Pipeline/sources/funnel expose revenue + marketing spend — sales/office only, never TECHNICIAN.
const SALES_READ = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] as const;

leadsRouter.get('/pipeline', restrictTo(...SALES_READ), catchAsync(leadsController.pipeline));
leadsRouter.patch('/:id/stage', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'), catchAsync(leadsController.setStage));
leadsRouter.get('/sources', restrictTo(...SALES_READ), catchAsync(leadsController.sources));
leadsRouter.post('/sources', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.createSource));
leadsRouter.delete('/sources/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.deactivateSource));
leadsRouter.get('/funnel', restrictTo(...SALES_READ), catchAsync(leadsController.funnel));
