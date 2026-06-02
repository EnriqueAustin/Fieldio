import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { customerNoteService } from './customer-notes.service';

export const customerNoteController = {
    getByCustomer: async (req: Request, res: Response) => {
        const limit = Number(req.query.limit) || 50;
        const notes = await customerNoteService.getByCustomer(req.params.customerId, req.user!.companyId, limit);
        res.json({ status: 'success', data: { notes } });
    },

    create: async (req: Request, res: Response) => {
        const note = await customerNoteService.create(req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { note } });
    },

    update: async (req: Request, res: Response) => {
        const note = await customerNoteService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { note } });
    },

    delete: async (req: Request, res: Response) => {
        await customerNoteService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    getTimeline: async (req: Request, res: Response) => {
        const timeline = await customerNoteService.getTimeline(req.params.customerId, req.user!.companyId);
        res.json({ status: 'success', data: timeline });
    },
};
