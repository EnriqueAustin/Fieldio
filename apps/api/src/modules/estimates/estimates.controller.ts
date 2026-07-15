import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { estimateService } from './estimates.service';

export const estimateController = {
    create: async (req: Request, res: Response) => {
        const estimate = await estimateService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { estimate } });
    },

    createFromField: async (req: Request, res: Response) => {
        const estimate = await estimateService.createFromField(
            req.user!.companyId,
            req.user!.role,
            req.body
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { estimate } });
    },

    getAll: async (req: Request, res: Response) => {
        const status = req.query.status as string | undefined;
        const estimates = await estimateService.getAll(req.user!.companyId, status);
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimates } });
    },

    send: async (req: Request, res: Response) => {
        const result = await estimateService.send(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    decline: async (req: Request, res: Response) => {
        const estimate = await estimateService.decline(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimate } });
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
    },

    addOption: async (req: Request, res: Response) => {
        const option = await estimateService.addOption(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { option } });
    },

    getOptions: async (req: Request, res: Response) => {
        const options = await estimateService.getOptions(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { options } });
    },

    acceptOption: async (req: Request, res: Response) => {
        const option = await estimateService.acceptOption(req.params.optionId, req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { option } });
    }
};
