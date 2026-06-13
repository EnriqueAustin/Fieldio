import { Router } from 'express';
import { warrantyClaimController } from '../modules/warranty-claims/warranty-claims.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const warrantyClaimRouter = Router();

warrantyClaimRouter.use(requireUser);

warrantyClaimRouter.get('/', catchAsync(warrantyClaimController.getAll));
warrantyClaimRouter.get('/expiring-warranties', catchAsync(warrantyClaimController.getExpiringWarranties));
warrantyClaimRouter.get('/asset/:assetId', catchAsync(warrantyClaimController.getByAsset));
warrantyClaimRouter.get('/:id', catchAsync(warrantyClaimController.getOne));
warrantyClaimRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(warrantyClaimController.create));
warrantyClaimRouter.put('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(warrantyClaimController.update));
