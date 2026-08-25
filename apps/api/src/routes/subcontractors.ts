import { Router } from 'express';
import { subcontractorController } from '../modules/subcontractors/subcontractors.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const subcontractorRouter = Router();

subcontractorRouter.use(requireUser);
// Dispatchers assign field work to subcontractors, so they can read the roster
// and job assignments; creating/editing subs and payouts stays office-side.
subcontractorRouter.use(restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'));
const officeOnly = restrictTo('ADMIN', 'OFFICE');

subcontractorRouter.get('/', catchAsync(subcontractorController.getAll));
subcontractorRouter.get('/expiring-docs', catchAsync(subcontractorController.getExpiringDocs));
subcontractorRouter.get('/payout-summary', officeOnly, catchAsync(subcontractorController.getPayoutSummary));
subcontractorRouter.get('/:id', catchAsync(subcontractorController.getOne));
subcontractorRouter.post('/', officeOnly, catchAsync(subcontractorController.create));
subcontractorRouter.put('/:id', officeOnly, catchAsync(subcontractorController.update));
subcontractorRouter.delete('/:id', officeOnly, catchAsync(subcontractorController.delete));

// Assignments
subcontractorRouter.post('/assignments', catchAsync(subcontractorController.createAssignment));
subcontractorRouter.put('/assignments/:id', catchAsync(subcontractorController.updateAssignment));
subcontractorRouter.get('/assignments/job/:jobId', catchAsync(subcontractorController.getAssignmentsByJob));
