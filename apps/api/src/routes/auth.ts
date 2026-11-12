import { Router, Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authController } from '../modules/auth/auth.controller';
import { requireUser } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { config } from '../config/env';
import { catchAsync } from '../utils/catchAsync';

export const authRouter = Router();

// Public self-registration is closed unless ALLOW_PUBLIC_REGISTRATION is set.
// Accounts are provisioned by an administrator from Settings → Team.
const requireOpenRegistration = (_req: Request, _res: Response, next: NextFunction) => {
    if (!config.ALLOW_PUBLIC_REGISTRATION) {
        return next(new AppError(
            'Registration is closed. Ask your administrator for an account.',
            StatusCodes.FORBIDDEN,
        ));
    }
    next();
};

authRouter.post('/register', requireOpenRegistration, catchAsync(authController.register));
authRouter.post('/login', catchAsync(authController.login));
authRouter.post('/refresh', catchAsync(authController.refresh));
authRouter.post('/logout', catchAsync(authController.logout));
authRouter.post('/forgot-password', catchAsync(authController.forgotPassword));
authRouter.post('/reset-password', catchAsync(authController.resetPassword));
authRouter.post('/change-password', requireUser, catchAsync(authController.changePassword));
