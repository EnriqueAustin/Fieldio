import { Router } from 'express';
import { leadsController } from '../modules/leads/leads.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const leadsRouter = Router();
leadsRouter.use(requireUser);

// Pipeline/sources/funnel expose revenue + marketing spend — sales/office only, never TECHNICIAN.
const SALES_READ = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] as const;
const SALES_WRITE = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] as const;

// Literal paths first so `/:id` can't swallow `/pipeline`, `/funnel`, `/sources`.
leadsRouter.get('/pipeline', restrictTo(...SALES_READ), catchAsync(leadsController.pipeline));
leadsRouter.get('/funnel', restrictTo(...SALES_READ), catchAsync(leadsController.funnel));

leadsRouter.get('/sources', restrictTo(...SALES_READ), catchAsync(leadsController.sources));
leadsRouter.post('/sources', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.createSource));
leadsRouter.patch('/sources/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.updateSource));
leadsRouter.delete('/sources/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.deactivateSource));

leadsRouter.post('/', restrictTo(...SALES_WRITE), catchAsync(leadsController.create));

// Conversion creates a quote/job — quoting is an office function, so office-only.
leadsRouter.post('/:id/convert', restrictTo('ADMIN', 'OFFICE'), catchAsync(leadsController.convert));
leadsRouter.patch('/:id/stage', restrictTo(...SALES_WRITE), catchAsync(leadsController.setStage));
leadsRouter.get('/:id/notes', restrictTo(...SALES_READ), catchAsync(leadsController.listNotes));
leadsRouter.post('/:id/notes', restrictTo(...SALES_WRITE), catchAsync(leadsController.addNote));
leadsRouter.get('/:id', restrictTo(...SALES_READ), catchAsync(leadsController.get));
leadsRouter.patch('/:id', restrictTo(...SALES_WRITE), catchAsync(leadsController.update));
