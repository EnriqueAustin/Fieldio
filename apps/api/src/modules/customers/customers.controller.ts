import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { customerService } from './customers.service';

export const customerController = {
    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = req.query.search as string;
        const result = await customerService.findAll(req.user!.companyId, page, limit, search);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    getOne: async (req: Request, res: Response) => {
        const customer = await customerService.findOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { customer } });
    },

    create: async (req: Request, res: Response) => {
        const customer = await customerService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { customer } });
    },

    update: async (req: Request, res: Response) => {
        const customer = await customerService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { customer } });
    },

    softDelete: async (req: Request, res: Response) => {
        await customerService.softDelete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
