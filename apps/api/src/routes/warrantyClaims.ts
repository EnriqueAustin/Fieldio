import { Router } from 'express';
import { warrantyClaimController } from '../modules/warranty-claims/warranty-claims.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const warrantyClaimRouter = Router();

warrantyClaimRouter.use(requireUser);

// Warranty claims surface the whole customer address book + assets — office only, never TECHNICIAN.
// (The tech site-history card reads warranty summaries via /jobs/:id/site-history, not these routes.)
const WARRANTY_READ = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR'] as const;

warrantyClaimRouter.get('/', restrictTo(...WARRANTY_READ), catchAsync(warrantyClaimController.getAll));
warrantyClaimRouter.get('/expiring-warranties', restrictTo(...WARRANTY_READ), catchAsync(warrantyClaimController.getExpiringWarranties));
warrantyClaimRouter.get('/asset/:assetId', restrictTo(...WARRANTY_READ), catchAsync(warrantyClaimController.getByAsset));
warrantyClaimRouter.get('/:id', restrictTo(...WARRANTY_READ), catchAsync(warrantyClaimController.getOne));
warrantyClaimRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(warrantyClaimController.create));
warrantyClaimRouter.put('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(warrantyClaimController.update));
