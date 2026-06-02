import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { supplierService } from './suppliers.service';

export const supplierController = {
    getAll: async (req: Request, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const suppliers = await supplierService.getAll(req.user!.companyId, includeInactive);
        res.status(StatusCodes.OK).json({ status: 'success', data: { suppliers } });
    },

    getOne: async (req: Request, res: Response) => {
        const supplier = await supplierService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { supplier } });
    },

    create: async (req: Request, res: Response) => {
        const supplier = await supplierService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { supplier } });
    },

    update: async (req: Request, res: Response) => {
        const supplier = await supplierService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { supplier } });
    },
};
