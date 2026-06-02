import { Router } from 'express';
import { portalController } from '../modules/portal/portal.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const publicPortalRouter = Router();

publicPortalRouter.get('/:token', catchAsync(portalController.getDashboard));
publicPortalRouter.get('/:token/jobs/:jobId', catchAsync(portalController.getJobDetail));
publicPortalRouter.post('/:token/estimates/:estimateId/approve', catchAsync(portalController.approveEstimate));

export const portalRouter = Router();

portalRouter.use(requireUser);
portalRouter.post('/customers/:customerId/portal-link', catchAsync(portalController.generateLink));
