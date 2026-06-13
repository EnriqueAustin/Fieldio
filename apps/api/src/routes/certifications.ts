import { Router } from 'express';
import { certificationController } from '../modules/certifications/certifications.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const certificationRouter = Router();

certificationRouter.use(requireUser);

certificationRouter.get('/', catchAsync(certificationController.getAll));
certificationRouter.get('/expiring', catchAsync(certificationController.getExpiring));
certificationRouter.get('/user/:userId', catchAsync(certificationController.getByUser));
certificationRouter.post('/', restrictTo('ADMIN', 'OFFICE'), catchAsync(certificationController.create));
certificationRouter.put('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(certificationController.update));
certificationRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(certificationController.delete));
