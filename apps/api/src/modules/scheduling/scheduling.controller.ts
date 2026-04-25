import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { schedulingService } from './scheduling.service';

const eventsQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
});

export const schedulingController = {
    getEvents: async (req: Request, res: Response) => {
        const { start, end } = eventsQuerySchema.parse(req.query);

        const events = await schedulingService.getEvents(
            req.user!.companyId,
            start,
            end
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { events } });
    },

    createJob: async (req: Request, res: Response) => {
        const job = await schedulingService.createJob(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { job } });
    },

    updateEvent: async (req: Request, res: Response) => {
        const job = await schedulingService.updateSchedule(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    }
};
