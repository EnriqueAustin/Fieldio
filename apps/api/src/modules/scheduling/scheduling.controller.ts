import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { schedulingService } from './scheduling.service';
import { AppError } from '../../middleware/error';

const OFFICE_ROUTE_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER'];

const dayRouteQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    techId: z.string().min(1).optional(),
    // Minutes east of UTC for the caller's day boundaries; defaults to SAST.
    tzOffset: z.coerce.number().int().min(-720).max(840).default(120),
});

const eventsQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
});

// Real tap time of a queued offline "On my way" — lets the status service skip a
// stale customer message when the replay finally lands.
const onMyWayBodySchema = z.object({
    clientAt: z.string().datetime().optional(),
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

    /** Technicians get their own route; office roles may pass ?techId=. */
    getDayRoute: async (req: Request, res: Response) => {
        const { date, techId, tzOffset } = dayRouteQuerySchema.parse(req.query);
        const { role, userId, companyId } = req.user!;
        let targetTechId = userId;
        if (techId && techId !== userId) {
            if (!OFFICE_ROUTE_ROLES.includes(role)) {
                throw new AppError('You can only view your own route', StatusCodes.FORBIDDEN);
            }
            targetTechId = techId;
        }
        if (targetTechId !== userId) {
            const tech = await schedulingService.findCompanyUser(companyId, targetTechId);
            if (!tech) throw new AppError('Technician not found', StatusCodes.NOT_FOUND);
        }
        const route = await schedulingService.getDayRoute(companyId, targetTechId, date, tzOffset);
        res.status(StatusCodes.OK).json({ status: 'success', data: { route } });
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
        const { clientAt } = onMyWayBodySchema.parse(req.body ?? {});
        const { userId, role, companyId } = req.user!;
        const data = await schedulingService.onMyWay(req.params.id, companyId, { userId, role }, clientAt);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    publicTracker: async (req: Request, res: Response) => {
        const data = await schedulingService.getTracking(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },
};
