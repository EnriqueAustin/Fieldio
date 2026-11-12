import { Router } from 'express';
import { bookingsController } from '../modules/bookings/bookings.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const publicBookingsRouter = Router();
publicBookingsRouter.post('/:companyId', catchAsync(bookingsController.submit));

// Inbound bookings carry prospective-customer contact details and convert creates
// customers/jobs — office roles only, never TECHNICIAN.
const BOOKING_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR'] as const;

export const bookingsRouter = Router();
bookingsRouter.use(requireUser);
bookingsRouter.get('/', restrictTo(...BOOKING_ROLES), catchAsync(bookingsController.list));
bookingsRouter.post('/:id/convert', restrictTo(...BOOKING_ROLES), catchAsync(bookingsController.convert));
