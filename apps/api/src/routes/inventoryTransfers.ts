import { Router } from 'express';
import { inventoryTransfersController } from '../modules/inventory-transfers/inventory-transfers.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const inventoryTransfersRouter = Router();

inventoryTransfersRouter.use(requireUser);

inventoryTransfersRouter.post('/', catchAsync(inventoryTransfersController.createTransfer));
inventoryTransfersRouter.get('/', catchAsync(inventoryTransfersController.getTransfers));
inventoryTransfersRouter.post('/:id/complete', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryTransfersController.completeTransfer));
inventoryTransfersRouter.post('/:id/cancel', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryTransfersController.cancelTransfer));
