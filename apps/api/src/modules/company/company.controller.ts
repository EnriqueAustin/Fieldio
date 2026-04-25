import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { companyService } from './company.service';

export const companyController = {
    getMe: async (req: Request, res: Response) => {
        const company = await companyService.getOne(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { company } });
    },

    updateMe: async (req: Request, res: Response) => {
        const company = await companyService.update(req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { company } });
    },
};
