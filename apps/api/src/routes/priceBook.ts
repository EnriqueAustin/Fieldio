import { Router } from 'express';
import { priceBookController } from '../modules/price-book/price-book.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const priceBookRouter = Router();

priceBookRouter.use(requireUser);

priceBookRouter.get('/', catchAsync(priceBookController.getAll));
priceBookRouter.get('/categories', catchAsync(priceBookController.getCategories));
priceBookRouter.post('/', catchAsync(priceBookController.create));
priceBookRouter.post('/bulk', catchAsync(priceBookController.bulkCreate));
priceBookRouter.get('/:id', catchAsync(priceBookController.getOne));
priceBookRouter.patch('/:id', catchAsync(priceBookController.update));
