import { Router } from 'express';
import { membershipController } from '../modules/memberships/memberships.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const membershipRouter = Router();

membershipRouter.use(requireUser);

// Tiers
membershipRouter.get('/tiers', catchAsync(membershipController.getTiers));
membershipRouter.get('/tiers/:id', catchAsync(membershipController.getTier));
membershipRouter.post('/tiers', catchAsync(membershipController.createTier));
membershipRouter.put('/tiers/:id', catchAsync(membershipController.updateTier));

// Memberships
membershipRouter.get('/', catchAsync(membershipController.getAll));
membershipRouter.get('/:id', catchAsync(membershipController.getOne));
membershipRouter.post('/', catchAsync(membershipController.create));
membershipRouter.post('/:id/cancel', catchAsync(membershipController.cancel));
membershipRouter.post('/:id/visit', catchAsync(membershipController.recordVisit));

// Customer-specific
membershipRouter.get('/customer/:customerId', catchAsync(membershipController.getByCustomer));
membershipRouter.get('/customer/:customerId/discount', catchAsync(membershipController.getDiscount));
