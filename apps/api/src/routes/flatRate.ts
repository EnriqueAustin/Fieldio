import { Router } from 'express';
import { flatRateController } from '../modules/flat-rate/flat-rate.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const flatRateRouter = Router();

flatRateRouter.use(requireUser);

flatRateRouter.get('/', catchAsync(flatRateController.getAll));
flatRateRouter.get('/categories', catchAsync(flatRateController.getCategories));
flatRateRouter.get('/:id', catchAsync(flatRateController.getOne));
flatRateRouter.post('/', catchAsync(flatRateController.create));
flatRateRouter.put('/:id', catchAsync(flatRateController.update));
flatRateRouter.delete('/:id', catchAsync(flatRateController.delete));
