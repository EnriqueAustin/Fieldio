import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { invoiceService } from './invoices.service';

export const invoiceController = {
    createFromJob: async (req: Request, res: Response) => {
        const invoice = await invoiceService.createFromJob(req.params.jobId, req.user!.companyId);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { invoice } });
    },

    getOne: async (req: Request, res: Response) => {
        const invoice = await invoiceService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    },

    getAll: async (req: Request, res: Response) => {
        const invoices = await invoiceService.getAll(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoices } });
    },

    send: async (req: Request, res: Response) => {
        const invoice = await invoiceService.send(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    }
};
