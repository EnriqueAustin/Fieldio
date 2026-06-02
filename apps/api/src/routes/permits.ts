import { Router } from 'express';
import { permitController } from '../modules/permits/permits.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const permitRouter = Router();

permitRouter.use(requireUser);

permitRouter.get('/', catchAsync(permitController.getAll));
permitRouter.get('/inspections/upcoming', catchAsync(permitController.getUpcoming));
permitRouter.get('/:id', catchAsync(permitController.getOne));
permitRouter.post('/', catchAsync(permitController.create));
permitRouter.put('/:id', catchAsync(permitController.update));
permitRouter.delete('/:id', catchAsync(permitController.delete));

// Inspections
permitRouter.post('/:id/inspections', catchAsync(permitController.addInspection));
permitRouter.put('/inspections/:inspectionId', catchAsync(permitController.updateInspection));
