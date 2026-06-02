import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { timeTrackingService } from './timeTracking.service';
import { z } from 'zod';

const startTimeEntrySchema = z.object({
    jobId: z.string().uuid().optional(),
    type: z.enum(['TRAVEL', 'WRENCH', 'ADMIN', 'BREAK']).optional(),
    startTime: z.string().datetime().optional(),
    description: z.string().optional(),
});

const updateTimeEntrySchema = z.object({
    jobId: z.string().uuid().optional(),
    type: z.enum(['TRAVEL', 'WRENCH', 'ADMIN', 'BREAK']).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    description: z.string().optional(),
});

const stopTimeEntrySchema = z.object({
    endTime: z.string().datetime().optional(),
});

export const timeTrackingController = {
    start: async (req: Request, res: Response) => {
        const data = startTimeEntrySchema.parse(req.body);
        const entry = await timeTrackingService.startEntry(req.user!.companyId, req.user!.userId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { entry } });
    },

    stop: async (req: Request, res: Response) => {
        const data = stopTimeEntrySchema.parse(req.body);
        const endTime = data.endTime ? new Date(data.endTime) : undefined;
        const entry = await timeTrackingService.stopEntry(req.params.id, req.user!.companyId, req.user!.userId, endTime);
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    update: async (req: Request, res: Response) => {
        const data = updateTimeEntrySchema.parse(req.body);
        const entry = await timeTrackingService.updateEntry(req.params.id, req.user!.companyId, req.user!.userId, data);
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    getOne: async (req: Request, res: Response) => {
        const entry = await timeTrackingService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const userId = req.query.userId as string;
        const jobId = req.query.jobId as string;
        
        const result = await timeTrackingService.getAll(req.user!.companyId, userId, jobId, page, limit);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    delete: async (req: Request, res: Response) => {
        await timeTrackingService.deleteEntry(req.params.id, req.user!.companyId, req.user!.userId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    }
};
