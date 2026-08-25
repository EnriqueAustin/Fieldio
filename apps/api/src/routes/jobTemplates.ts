import { Router } from 'express';
import { jobTemplatesController } from '../modules/job-templates/job-templates.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const jobTemplatesRouter = Router();
jobTemplatesRouter.use(requireUser);
// Templates carry default line-item pricing, and only the office side creates
// jobs from them.
jobTemplatesRouter.use(restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'));

jobTemplatesRouter.get('/', catchAsync(jobTemplatesController.list));
jobTemplatesRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobTemplatesController.create));
jobTemplatesRouter.get('/:id', catchAsync(jobTemplatesController.get));
jobTemplatesRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobTemplatesController.update));
jobTemplatesRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(jobTemplatesController.deactivate));
jobTemplatesRouter.post('/:id/apply', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR'), catchAsync(jobTemplatesController.apply));
