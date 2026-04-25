import { Router } from 'express';
import { bookingsController } from '../modules/bookings/bookings.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const publicBookingsRouter = Router();
publicBookingsRouter.post('/:companyId', catchAsync(bookingsController.submit));

export const bookingsRouter = Router();
bookingsRouter.use(requireUser);
bookingsRouter.get('/', catchAsync(bookingsController.list));
bookingsRouter.post('/:id/convert', catchAsync(bookingsController.convert));
