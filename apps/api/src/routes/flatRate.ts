import { Router } from 'express';
import { flatRateController } from '../modules/flat-rate/flat-rate.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const flatRateRouter = Router();

flatRateRouter.use(requireUser);

flatRateRouter.get('/', catchAsync(flatRateController.getAll));
flatRateRouter.get('/categories', catchAsync(flatRateController.getCategories));
flatRateRouter.get('/:id', catchAsync(flatRateController.getOne));
flatRateRouter.post('/', restrictTo('ADMIN'), catchAsync(flatRateController.create));
flatRateRouter.put('/:id', restrictTo('ADMIN'), catchAsync(flatRateController.update));
flatRateRouter.delete('/:id', restrictTo('ADMIN'), catchAsync(flatRateController.delete));
