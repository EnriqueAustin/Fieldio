import { Router } from 'express';
import { inventoryTransfersController } from '../modules/inventory-transfers/inventory-transfers.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const inventoryTransfersRouter = Router();

inventoryTransfersRouter.use(requireUser);

// Transfers move stock between warehouse and vans and expose unitCost on completion —
// office/dispatch only, never TECHNICIAN. (My-Van stock draws go through /vans/:id/inventory/*.)
const TRANSFER_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

inventoryTransfersRouter.post('/', restrictTo(...TRANSFER_ROLES), catchAsync(inventoryTransfersController.createTransfer));
inventoryTransfersRouter.get('/', restrictTo(...TRANSFER_ROLES), catchAsync(inventoryTransfersController.getTransfers));
inventoryTransfersRouter.post('/:id/complete', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryTransfersController.completeTransfer));
inventoryTransfersRouter.post('/:id/cancel', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryTransfersController.cancelTransfer));
