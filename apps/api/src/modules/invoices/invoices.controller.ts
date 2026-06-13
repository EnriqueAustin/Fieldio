import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
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
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const status = req.query.status as string | undefined;
        const result = await invoiceService.getAll(req.user!.companyId, page, limit, status);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    send: async (req: Request, res: Response) => {
        const invoice = await invoiceService.send(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    },

    getOverdue: async (req: Request, res: Response) => {
        const invoices = await invoiceService.getOverdue(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoices } });
    },

    sendReminder: async (req: Request, res: Response) => {
        const result = await invoiceService.sendReminder(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    sendBulkReminders: async (req: Request, res: Response) => {
        const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(req.body);
        const results = await invoiceService.sendBulkReminders(ids, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { results } });
    },

    softDelete: async (req: Request, res: Response) => {
        await invoiceService.softDelete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
