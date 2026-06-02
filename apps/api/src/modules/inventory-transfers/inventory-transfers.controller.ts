import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inventoryTransfersService } from './inventory-transfers.service';

export const inventoryTransfersController = {
    createTransfer: async (req: Request, res: Response) => {
        const transfer = await inventoryTransfersService.createTransfer(
            req.user!.companyId,
            req.user!.userId,
            req.body
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { transfer } });
    },

    getTransfers: async (req: Request, res: Response) => {
        const transfers = await inventoryTransfersService.getTransfers(
            req.user!.companyId,
            req.query.status as string
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { transfers } });
    },

    completeTransfer: async (req: Request, res: Response) => {
        const transfer = await inventoryTransfersService.completeTransfer(
            req.params.id,
            req.user!.companyId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { transfer } });
    },

    cancelTransfer: async (req: Request, res: Response) => {
        const transfer = await inventoryTransfersService.cancelTransfer(
            req.params.id,
            req.user!.companyId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { transfer } });
    }
};
