import { Router } from 'express';
import { inventoryTransfersController } from '../modules/inventory-transfers/inventory-transfers.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const inventoryTransfersRouter = Router();

inventoryTransfersRouter.use(requireUser);

inventoryTransfersRouter.post('/', catchAsync(inventoryTransfersController.createTransfer));
inventoryTransfersRouter.get('/', catchAsync(inventoryTransfersController.getTransfers));
inventoryTransfersRouter.post('/:id/complete', catchAsync(inventoryTransfersController.completeTransfer));
inventoryTransfersRouter.post('/:id/cancel', catchAsync(inventoryTransfersController.cancelTransfer));
