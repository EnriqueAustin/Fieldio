import { Router } from 'express';
import { userController } from '../modules/users/users.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const userRouter = Router();

userRouter.use(requireUser);

// The staff list carries roles + permissions JSON and the skills catalog drives
// dispatch assignment — office/dispatch only, never TECHNICIAN.
const STAFF_READ = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

userRouter.get('/', restrictTo(...STAFF_READ), catchAsync(userController.getAll));
userRouter.get('/skills-catalog', restrictTo(...STAFF_READ), catchAsync(userController.skillsCatalog));
userRouter.post('/', restrictTo('ADMIN'), catchAsync(userController.create));
userRouter.patch('/:id', restrictTo('ADMIN'), catchAsync(userController.update));
userRouter.patch('/:id/skills', restrictTo('ADMIN', 'DISPATCHER', 'OFFICE'), catchAsync(userController.updateSkills));
userRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(userController.delete));
