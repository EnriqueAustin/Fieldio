import { Router } from 'express';
import { financingController } from '../modules/financing/financing.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const financingRouter = Router();

financingRouter.use(requireUser);

// Sales offers financing at the point of quote, so they work applications too;
// the financing products themselves stay admin-configured.
const canWorkApplications = restrictTo('ADMIN', 'OFFICE', 'SALES');

// Options (admin config)
financingRouter.get('/options', catchAsync(financingController.getOptions));
financingRouter.post('/options', restrictTo('ADMIN'), catchAsync(financingController.createOption));
financingRouter.put('/options/:id', restrictTo('ADMIN'), catchAsync(financingController.updateOption));

// Applications
financingRouter.get('/applications', canWorkApplications, catchAsync(financingController.getApplications));
financingRouter.get('/applications/:id', canWorkApplications, catchAsync(financingController.getApplication));
financingRouter.post('/applications', canWorkApplications, catchAsync(financingController.createApplication));
financingRouter.put('/applications/:id', canWorkApplications, catchAsync(financingController.updateApplication));
financingRouter.get('/estimate/:estimateId', canWorkApplications, catchAsync(financingController.getByEstimate));
