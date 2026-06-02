import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { estimateService } from './estimates.service';

export const estimateController = {
    create: async (req: Request, res: Response) => {
        const estimate = await estimateService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { estimate } });
    },

    getAll: async (req: Request, res: Response) => {
        const estimates = await estimateService.getAll(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimates } });
    },

    getOne: async (req: Request, res: Response) => {
        const estimate = await estimateService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimate } });
    },

    approveWithSignature: async (req: Request, res: Response) => {
        const estimate = await estimateService.approveWithSignature(
            req.params.id,
            req.user!.companyId,
            req.body
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimate } });
    },

    convertToJob: async (req: Request, res: Response) => {
        const job = await estimateService.convertToJob(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    }
};
