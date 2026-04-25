import { Router } from 'express';
import { userController } from '../modules/users/users.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const userRouter = Router();

userRouter.use(requireUser);

userRouter.get('/', catchAsync(userController.getAll));
userRouter.post('/', restrictTo('ADMIN'), catchAsync(userController.create));
userRouter.patch('/:id', restrictTo('ADMIN'), catchAsync(userController.update));
userRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(userController.delete));
