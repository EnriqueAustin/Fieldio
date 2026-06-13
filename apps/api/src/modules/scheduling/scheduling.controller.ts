import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { schedulingService } from './scheduling.service';

const eventsQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
});

export const schedulingController = {
    getUnscheduled: async (req: Request, res: Response) => {
        const jobs = await schedulingService.getUnscheduled(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { jobs } });
    },

    getEvents: async (req: Request, res: Response) => {
        const { start, end } = eventsQuerySchema.parse(req.query);

        const branchId = req.query.branchId as string | undefined;
        const events = await schedulingService.getEvents(
            req.user!.companyId,
            start,
            end,
            branchId,
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { events } });
    },

    getMyWeek: async (req: Request, res: Response) => {
        const { start, end } = eventsQuerySchema.parse(req.query);
        const events = await schedulingService.getMyWeek(
            req.user!.companyId, req.user!.userId, start, end
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
    },

    suggestTechs: async (req: Request, res: Response) => {
        const data = await schedulingService.suggestTechs(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    onMyWay: async (req: Request, res: Response) => {
        const data = await schedulingService.onMyWay(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    publicTracker: async (req: Request, res: Response) => {
        const data = await schedulingService.getTracking(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },
};
