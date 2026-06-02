import { Router } from 'express';
import { jobsController } from '../modules/jobs/jobs.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const jobRouter = Router();

jobRouter.use(requireUser);

jobRouter.get('/assigned/me', catchAsync(jobsController.getAssignedToMe));
jobRouter.get('/', catchAsync(jobsController.getAll));
jobRouter.post('/', catchAsync(jobsController.create));
jobRouter.post('/quick', catchAsync(jobsController.quickCreate));
jobRouter.get('/:id', catchAsync(jobsController.getOne));
jobRouter.patch('/:id', catchAsync(jobsController.update));
jobRouter.delete('/:id', catchAsync(jobsController.softDelete));
jobRouter.patch('/:id/status', catchAsync(jobsController.updateStatus));
jobRouter.patch('/:id/checklist/:checkId', catchAsync(jobsController.toggleChecklist));
jobRouter.post('/:id/notes', catchAsync(jobsController.addNote));
jobRouter.post('/:id/signatures', catchAsync(jobsController.addSignature));
jobRouter.post('/:id/line-items', catchAsync(jobsController.addLineItem));
jobRouter.delete('/:id/line-items/:itemId', catchAsync(jobsController.removeLineItem));
jobRouter.post('/:id/checklist', catchAsync(jobsController.addChecklistItem));
jobRouter.delete('/:id/checklist/:checkId', catchAsync(jobsController.removeChecklistItem));
