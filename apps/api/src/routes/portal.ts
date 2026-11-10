import { Router } from 'express';
import { portalController } from '../modules/portal/portal.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const publicPortalRouter = Router();

publicPortalRouter.get('/:token', catchAsync(portalController.getDashboard));
publicPortalRouter.get('/:token/jobs/:jobId', catchAsync(portalController.getJobDetail));
publicPortalRouter.post('/:token/estimates/:estimateId/approve', catchAsync(portalController.approveEstimate));
publicPortalRouter.post('/:token/estimates/:estimateId/decline', catchAsync(portalController.declineEstimate));
publicPortalRouter.post('/:token/estimates/:estimateId/financing', catchAsync(portalController.requestFinancing));
publicPortalRouter.get('/:token/jobs/:jobId/reschedule', catchAsync(portalController.getRescheduleOptions));
publicPortalRouter.post('/:token/jobs/:jobId/reschedule', catchAsync(portalController.rescheduleJob));

export const portalRouter = Router();

portalRouter.use(requireUser);
// A portal link exposes the customer's quotes and invoices: office roles only.
portalRouter.post('/customers/:customerId/portal-link', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'), catchAsync(portalController.generateLink));
