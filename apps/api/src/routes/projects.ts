import { Router } from 'express';
import { projectsController } from '../modules/projects/projects.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const projectsRouter = Router();

projectsRouter.use(requireUser);

projectsRouter.post('/', catchAsync(projectsController.create));
projectsRouter.get('/', catchAsync(projectsController.getAll));
projectsRouter.get('/:id', catchAsync(projectsController.getOne));
projectsRouter.patch('/:id', catchAsync(projectsController.update));
projectsRouter.delete('/:id', catchAsync(projectsController.delete));
