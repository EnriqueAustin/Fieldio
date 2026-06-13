import { Router } from 'express';
import { authController } from '../modules/auth/auth.controller';
import { catchAsync } from '../utils/catchAsync';

export const authRouter = Router();

authRouter.post('/register', catchAsync(authController.register));
authRouter.post('/login', catchAsync(authController.login));
authRouter.post('/refresh', catchAsync(authController.refresh));
authRouter.post('/logout', catchAsync(authController.logout));
