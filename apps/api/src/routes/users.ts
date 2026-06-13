import { Router } from 'express';
import { userController } from '../modules/users/users.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const userRouter = Router();

userRouter.use(requireUser);

userRouter.get('/', catchAsync(userController.getAll));
userRouter.get('/skills-catalog', catchAsync(userController.skillsCatalog));
userRouter.post('/', restrictTo('ADMIN'), catchAsync(userController.create));
userRouter.patch('/:id', restrictTo('ADMIN'), catchAsync(userController.update));
userRouter.patch('/:id/skills', restrictTo('ADMIN', 'DISPATCHER', 'OFFICE'), catchAsync(userController.updateSkills));
userRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(userController.delete));
