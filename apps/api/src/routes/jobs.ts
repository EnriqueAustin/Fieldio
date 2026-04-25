import { Router } from 'express';
import { jobsController } from '../modules/jobs/jobs.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const jobRouter = Router();

jobRouter.use(requireUser);

jobRouter.get('/', catchAsync(jobsController.getAll));
jobRouter.get('/:id', catchAsync(jobsController.getOne));
jobRouter.patch('/:id/status', catchAsync(jobsController.updateStatus));
jobRouter.patch('/:id/checklist/:checkId', catchAsync(jobsController.toggleChecklist));
