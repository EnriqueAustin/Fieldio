import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { purchaseOrderService } from './purchase-orders.service';

export const purchaseOrderController = {
    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const supplierId = req.query.supplierId as string | undefined;
        const jobId = req.query.jobId as string | undefined;
        const result = await purchaseOrderService.getAll(req.user!.companyId, page, limit, supplierId, jobId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    getOne: async (req: Request, res: Response) => {
        const po = await purchaseOrderService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { purchaseOrder: po } });
    },

    create: async (req: Request, res: Response) => {
        const po = await purchaseOrderService.create(req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { purchaseOrder: po } });
    },

    update: async (req: Request, res: Response) => {
        const po = await purchaseOrderService.update(
            req.params.id, req.user!.companyId, req.user!.userId, req.body
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { purchaseOrder: po } });
    },
};
