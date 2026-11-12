import { Router } from 'express';
import { permitController } from '../modules/permits/permits.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const permitRouter = Router();

permitRouter.use(requireUser);

// Permits carry fees — office/dispatch only, never TECHNICIAN.
const PERMIT_READ = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

permitRouter.get('/', restrictTo(...PERMIT_READ), catchAsync(permitController.getAll));
permitRouter.get('/inspections/upcoming', restrictTo(...PERMIT_READ), catchAsync(permitController.getUpcoming));
permitRouter.get('/:id', restrictTo(...PERMIT_READ), catchAsync(permitController.getOne));
permitRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(permitController.create));
permitRouter.put('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(permitController.update));
permitRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(permitController.delete));

// Inspections
permitRouter.post('/:id/inspections', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(permitController.addInspection));
permitRouter.put('/inspections/:inspectionId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(permitController.updateInspection));
