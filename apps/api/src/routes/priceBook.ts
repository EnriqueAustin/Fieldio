import { Router } from 'express';
import { priceBookController } from '../modules/price-book/price-book.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const priceBookRouter = Router();

priceBookRouter.use(requireUser);

// Writes are an office function (ADMIN + OFFICE); technicians never manage pricing.
const canWrite = restrictTo('ADMIN', 'OFFICE');

priceBookRouter.get('/', catchAsync(priceBookController.getAll));
priceBookRouter.get('/categories', catchAsync(priceBookController.getCategories));
priceBookRouter.post('/', canWrite, catchAsync(priceBookController.create));
priceBookRouter.post('/bulk', canWrite, catchAsync(priceBookController.bulkImport));
priceBookRouter.get('/:id', catchAsync(priceBookController.getOne));
priceBookRouter.patch('/:id', canWrite, catchAsync(priceBookController.update));
priceBookRouter.delete('/:id', canWrite, catchAsync(priceBookController.archive));
