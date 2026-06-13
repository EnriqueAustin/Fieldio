import { Router } from 'express';
import { membershipController } from '../modules/memberships/memberships.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const membershipRouter = Router();

membershipRouter.use(requireUser);

// Tiers (admin-only for write)
membershipRouter.get('/tiers', catchAsync(membershipController.getTiers));
membershipRouter.get('/tiers/:id', catchAsync(membershipController.getTier));
membershipRouter.post('/tiers', restrictTo('ADMIN'), catchAsync(membershipController.createTier));
membershipRouter.put('/tiers/:id', restrictTo('ADMIN'), catchAsync(membershipController.updateTier));

// Memberships
membershipRouter.get('/', catchAsync(membershipController.getAll));
membershipRouter.get('/:id', catchAsync(membershipController.getOne));
membershipRouter.post('/', restrictTo('ADMIN', 'OFFICE'), catchAsync(membershipController.create));
membershipRouter.post('/:id/cancel', restrictTo('ADMIN', 'OFFICE'), catchAsync(membershipController.cancel));
membershipRouter.post('/:id/visit', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(membershipController.recordVisit));

// Customer-specific
membershipRouter.get('/customer/:customerId', catchAsync(membershipController.getByCustomer));
membershipRouter.get('/customer/:customerId/discount', catchAsync(membershipController.getDiscount));
