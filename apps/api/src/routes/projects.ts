import { Router } from 'express';
import { projectsController } from '../modules/projects/projects.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const projectsRouter = Router();

projectsRouter.use(requireUser);

// Projects carry estimates + invoices (money) — office/sales/accounting only, never TECHNICIAN.
const OFFICE_READ = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'] as const;

projectsRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(projectsController.create));
projectsRouter.get('/', restrictTo(...OFFICE_READ), catchAsync(projectsController.getAll));
projectsRouter.get('/:id', restrictTo(...OFFICE_READ), catchAsync(projectsController.getOne));
projectsRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(projectsController.update));
projectsRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(projectsController.delete));
