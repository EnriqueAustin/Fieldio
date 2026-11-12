import { Router, Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { certificationController } from '../modules/certifications/certifications.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { catchAsync } from '../utils/catchAsync';

export const certificationRouter = Router();

certificationRouter.use(requireUser);

// The staff-wide certification list belongs to the office; a technician may read
// only their own record via /user/:userId.
const CERT_OFFICE = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

// Office roles may read anyone's certifications; a technician only their own.
const ownCertsOnly = (req: Request, _res: Response, next: NextFunction) => {
    const { role, userId } = req.user!;
    if ((CERT_OFFICE as readonly string[]).includes(role) || req.params.userId === userId) {
        return next();
    }
    return next(new AppError('You can only view your own certifications', StatusCodes.FORBIDDEN));
};

certificationRouter.get('/', restrictTo(...CERT_OFFICE), catchAsync(certificationController.getAll));
certificationRouter.get('/expiring', restrictTo(...CERT_OFFICE), catchAsync(certificationController.getExpiring));
certificationRouter.get('/user/:userId', ownCertsOnly, catchAsync(certificationController.getByUser));
certificationRouter.post('/', restrictTo('ADMIN', 'OFFICE'), catchAsync(certificationController.create));
certificationRouter.put('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(certificationController.update));
certificationRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(certificationController.delete));
