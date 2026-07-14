import { Router } from 'express';
import { searchController } from '../modules/search/search.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const searchRouter = Router();

searchRouter.use(requireUser);
searchRouter.get('/', catchAsync(searchController.global));
