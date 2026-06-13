import { Router } from 'express';
import { subcontractorController } from '../modules/subcontractors/subcontractors.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const subcontractorRouter = Router();

subcontractorRouter.use(requireUser);
subcontractorRouter.use(restrictTo('ADMIN', 'OFFICE'));

subcontractorRouter.get('/', catchAsync(subcontractorController.getAll));
subcontractorRouter.get('/expiring-docs', catchAsync(subcontractorController.getExpiringDocs));
subcontractorRouter.get('/payout-summary', catchAsync(subcontractorController.getPayoutSummary));
subcontractorRouter.get('/:id', catchAsync(subcontractorController.getOne));
subcontractorRouter.post('/', catchAsync(subcontractorController.create));
subcontractorRouter.put('/:id', catchAsync(subcontractorController.update));
subcontractorRouter.delete('/:id', catchAsync(subcontractorController.delete));

// Assignments
subcontractorRouter.post('/assignments', catchAsync(subcontractorController.createAssignment));
subcontractorRouter.put('/assignments/:id', catchAsync(subcontractorController.updateAssignment));
subcontractorRouter.get('/assignments/job/:jobId', catchAsync(subcontractorController.getAssignmentsByJob));
