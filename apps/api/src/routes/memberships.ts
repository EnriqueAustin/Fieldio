import { Router } from 'express';
import { membershipController } from '../modules/memberships/memberships.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const membershipRouter = Router();

membershipRouter.use(requireUser);

// Tier prices and discounts: every role except TECHNICIAN may read. Techs only
// record visits (POST /:id/visit).
const officeRead = restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT');

// Tiers (admin-only for write)
membershipRouter.get('/tiers', officeRead, catchAsync(membershipController.getTiers));
membershipRouter.get('/tiers/:id', officeRead, catchAsync(membershipController.getTier));
membershipRouter.post('/tiers', restrictTo('ADMIN'), catchAsync(membershipController.createTier));
membershipRouter.put('/tiers/:id', restrictTo('ADMIN'), catchAsync(membershipController.updateTier));

// Memberships
membershipRouter.get('/', officeRead, catchAsync(membershipController.getAll));
membershipRouter.get('/:id', officeRead, catchAsync(membershipController.getOne));
membershipRouter.post('/', restrictTo('ADMIN', 'OFFICE'), catchAsync(membershipController.create));
membershipRouter.post('/:id/cancel', restrictTo('ADMIN', 'OFFICE'), catchAsync(membershipController.cancel));
membershipRouter.post('/:id/visit', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(membershipController.recordVisit));

// Customer-specific
membershipRouter.get('/customer/:customerId', officeRead, catchAsync(membershipController.getByCustomer));
membershipRouter.get('/customer/:customerId/discount', officeRead, catchAsync(membershipController.getDiscount));
