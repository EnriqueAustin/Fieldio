import { Router } from 'express';
import { projectsController } from '../modules/projects/projects.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const projectsRouter = Router();

projectsRouter.use(requireUser);

projectsRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(projectsController.create));
projectsRouter.get('/', catchAsync(projectsController.getAll));
projectsRouter.get('/:id', catchAsync(projectsController.getOne));
projectsRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(projectsController.update));
projectsRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(projectsController.delete));
