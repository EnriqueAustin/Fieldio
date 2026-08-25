import { Router } from 'express';
import { authController } from '../modules/auth/auth.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const authRouter = Router();

authRouter.post('/register', catchAsync(authController.register));
authRouter.post('/login', catchAsync(authController.login));
authRouter.post('/refresh', catchAsync(authController.refresh));
authRouter.post('/logout', catchAsync(authController.logout));
authRouter.post('/forgot-password', catchAsync(authController.forgotPassword));
authRouter.post('/reset-password', catchAsync(authController.resetPassword));
authRouter.post('/change-password', requireUser, catchAsync(authController.changePassword));
