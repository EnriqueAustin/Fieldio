import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AppError } from './error';
import { verifyAccessToken } from '../utils/jwt';

// Extend Express Request
declare global {
    namespace Express {
        interface AuthUser {
            userId: string;
            companyId: string;
            role: string;
        }

        interface Request {
            user?: AuthUser;
        }
    }
}

export const deserializeUser = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next();
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return next();
    }

    const decoded = verifyAccessToken(token);

    if (decoded) {
        req.user = decoded;
    }

    next();
};

export const requireUser = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.user) {
        return next(
            new AppError('You must be logged in', StatusCodes.UNAUTHORIZED)
        );
    }
    next();
};

export const restrictTo = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(
                new AppError(
                    'You do not have permission to perform this action',
                    StatusCodes.FORBIDDEN
                )
            );
        }
        next();
    };
};
