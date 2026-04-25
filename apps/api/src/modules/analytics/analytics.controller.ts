import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { analyticsService } from './analytics.service';

const rangeSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
});

export const analyticsController = {
    getDashboard: async (req: Request, res: Response) => {
        const parsed = rangeSchema.parse(req.query);
        const stats = await analyticsService.getDashboardStats(req.user!.companyId, {
            from: parsed.from ? new Date(parsed.from) : undefined,
            to: parsed.to ? new Date(parsed.to) : undefined,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: { stats } });
    }
};
