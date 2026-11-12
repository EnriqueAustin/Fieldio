import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../middleware/error';
import { analyticsService } from './analytics.service';
import { kpiService } from './kpi.service';
import { getCompanyTimezone, zonedTimeToUtc } from '../../utils/timezone';

// Accept either a plain calendar date (yyyy-mm-dd) or a full ISO datetime.
const rangeSchema = z.object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve the from/to query into UTC instants using the company's timezone.
 * A date-only `from` becomes 00:00 of that local day; a date-only `to` becomes
 * the LAST millisecond of that local day, so the whole "to" day is inclusive.
 * Full ISO datetimes are used verbatim. Invalid values are a 400.
 */
const parseRange = async (query: any, companyId: string) => {
    const parsed = rangeSchema.parse(query);
    const tz = await getCompanyTimezone(companyId);

    const toInstant = (value: string | undefined, endOfDay: boolean): Date | undefined => {
        if (!value) return undefined;
        if (DATE_ONLY.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return endOfDay
                ? new Date(zonedTimeToUtc(y, m, d + 1, 0, 0, tz).getTime() - 1)
                : zonedTimeToUtc(y, m, d, 0, 0, tz);
        }
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) {
            throw new AppError(`Invalid date: ${value}`, StatusCodes.BAD_REQUEST);
        }
        return dt;
    };

    const from = toInstant(parsed.from, false);
    const to = toInstant(parsed.to, true);
    if (from && to && from.getTime() > to.getTime()) {
        throw new AppError('`from` must be on or before `to`', StatusCodes.BAD_REQUEST);
    }
    return { from, to };
};

export const analyticsController = {
    getDashboard: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const stats = await analyticsService.getDashboardStats(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { stats } });
    },

    getJobCosting: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getJobCostingReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTimesheet: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getTimesheetReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTechEarnings: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getTechEarningsReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTechScorecards: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getTechScorecards(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getRevenueByServiceType: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getRevenueByServiceType(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getEstimateConversion: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const report = await analyticsService.getEstimateConversionReport(req.user!.companyId, range);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getAvgTicketTrend: async (req: Request, res: Response) => {
        const months = Number(req.query.months) || 6;
        const report = await analyticsService.getAvgTicketTrend(req.user!.companyId, months);
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getTimeseries: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const days = Number(req.query.days) || undefined;
        const report = await analyticsService.getTimeseries(req.user!.companyId, { ...range, days });
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getScoreboard: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const days = Number(req.query.days) || undefined;
        const report = await analyticsService.getTechScoreboard(req.user!.companyId, { ...range, days });
        res.status(StatusCodes.OK).json({ status: 'success', data: { report } });
    },

    getKpiSnapshot: async (req: Request, res: Response) => {
        const range = await parseRange(req.query, req.user!.companyId);
        const days = Number(req.query.days) || 30;
        const snapshot = await kpiService.snapshot(req.user!.companyId, { ...range, days });
        res.status(StatusCodes.OK).json({ status: 'success', data: { snapshot } });
    },

    getKpiHistory: async (req: Request, res: Response) => {
        const limit = Number(req.query.limit) || 30;
        const history = await kpiService.history(req.user!.companyId, limit);
        res.status(StatusCodes.OK).json({ status: 'success', data: { history } });
    },
};
