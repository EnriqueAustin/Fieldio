import { Router } from 'express';
import { financingController } from '../modules/financing/financing.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const financingRouter = Router();

financingRouter.use(requireUser);

// Options (admin config)
financingRouter.get('/options', catchAsync(financingController.getOptions));
financingRouter.post('/options', restrictTo('ADMIN'), catchAsync(financingController.createOption));
financingRouter.put('/options/:id', restrictTo('ADMIN'), catchAsync(financingController.updateOption));

// Applications
financingRouter.get('/applications', restrictTo('ADMIN', 'OFFICE'), catchAsync(financingController.getApplications));
financingRouter.get('/applications/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(financingController.getApplication));
financingRouter.post('/applications', restrictTo('ADMIN', 'OFFICE'), catchAsync(financingController.createApplication));
financingRouter.put('/applications/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(financingController.updateApplication));
financingRouter.get('/estimate/:estimateId', restrictTo('ADMIN', 'OFFICE'), catchAsync(financingController.getByEstimate));
