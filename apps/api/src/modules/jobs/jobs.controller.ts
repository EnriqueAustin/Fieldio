import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { jobsService } from './jobs.service';
import { z } from 'zod';

const updateStatusSchema = z.object({
    status: z.enum(['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELED']),
});

const toggleChecklistSchema = z.object({
    isCompleted: z.boolean(),
});

export const jobsController = {
    getOne: async (req: Request, res: Response) => {
        const job = await jobsService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const status = req.query.status as string;

        const result = await jobsService.getAll(req.user!.companyId, page, limit, status);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    updateStatus: async (req: Request, res: Response) => {
        const { status } = updateStatusSchema.parse(req.body);
        const job = await jobsService.updateStatus(
            req.params.id,
            req.user!.companyId,
            status,
            req.user!.userId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    toggleChecklist: async (req: Request, res: Response) => {
        const { isCompleted } = toggleChecklistSchema.parse(req.body);
        const item = await jobsService.toggleChecklist(
            req.params.id,
            req.params.checkId,
            req.user!.companyId,
            isCompleted
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    }
};
