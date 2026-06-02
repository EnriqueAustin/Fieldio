import { Router } from 'express';
import { financingController } from '../modules/financing/financing.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const financingRouter = Router();

financingRouter.use(requireUser);

// Options
financingRouter.get('/options', catchAsync(financingController.getOptions));
financingRouter.post('/options', catchAsync(financingController.createOption));
financingRouter.put('/options/:id', catchAsync(financingController.updateOption));

// Applications
financingRouter.get('/applications', catchAsync(financingController.getApplications));
financingRouter.get('/applications/:id', catchAsync(financingController.getApplication));
financingRouter.post('/applications', catchAsync(financingController.createApplication));
financingRouter.put('/applications/:id', catchAsync(financingController.updateApplication));
financingRouter.get('/estimate/:estimateId', catchAsync(financingController.getByEstimate));
