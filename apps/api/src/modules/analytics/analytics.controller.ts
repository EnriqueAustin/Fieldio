import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { analyticsService } from './analytics.service';

const rangeSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
});

const parseRange = (query: any) => {
    const parsed = rangeSchema.parse(query);
    return {
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
    };
};

export const analyticsController = {
    getDashboard: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const stats = await analyticsService.getDashboardStats(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { stats } });
    },

    getJobCosting: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getJobCostingReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTimesheet: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getTimesheetReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTechEarnings: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getTechEarningsReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTechScorecards: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getTechScorecards(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getRevenueByServiceType: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getRevenueByServiceType(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getEstimateConversion: async (req: Request, res: Response) => {
        const range = parseRange(req.query);
        const report = await analyticsService.getEstimateConversionReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getAvgTicketTrend: async (req: Request, res: Response) => {
        const months = Number(req.query.months) || 6;
        const report = await analyticsService.getAvgTicketTrend(req.user!.companyId, months);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },
};
