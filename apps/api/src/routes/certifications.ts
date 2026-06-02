import { Router } from 'express';
import { certificationController } from '../modules/certifications/certifications.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const certificationRouter = Router();

certificationRouter.use(requireUser);

certificationRouter.get('/', catchAsync(certificationController.getAll));
certificationRouter.get('/expiring', catchAsync(certificationController.getExpiring));
certificationRouter.get('/user/:userId', catchAsync(certificationController.getByUser));
certificationRouter.post('/', catchAsync(certificationController.create));
certificationRouter.put('/:id', catchAsync(certificationController.update));
certificationRouter.delete('/:id', catchAsync(certificationController.delete));
