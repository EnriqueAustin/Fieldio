import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { timeTrackingService, buildTimesheetCsv } from './timeTracking.service';
import { formatDateTimeInTimeZone } from '../../utils/timezone';
import { z } from 'zod';

const startTimeEntrySchema = z.object({
    jobId: z.string().uuid().optional(),
    type: z.enum(['TRAVEL', 'WRENCH', 'ADMIN', 'BREAK']).optional(),
    startTime: z.string().datetime().optional(),
    description: z.string().optional(),
});

// An edit always carries a reason — a corrected payroll record must say why.
const updateTimeEntrySchema = z.object({
    jobId: z.string().uuid().optional(),
    type: z.enum(['TRAVEL', 'WRENCH', 'ADMIN', 'BREAK']).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    description: z.string().optional(),
    reason: z.string().trim().min(1, 'A reason is required'),
});

// "Add missed entry" — office records labour the status clock never captured.
const manualTimeEntrySchema = z.object({
    userId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    note: z.string().trim().min(1, 'A reason/note is required'),
});

const stopTimeEntrySchema = z.object({
    endTime: z.string().datetime().optional(),
});

const deleteTimeEntrySchema = z.object({
    reason: z.string().trim().min(1).optional(),
});

/**
 * Which timesheet the caller may touch. A technician is limited to their own
 * rows; office roles correct anyone's, which is the whole point of the
 * adjustment endpoints now that the field no longer logs its own hours.
 */
const scopeFor = (req: Request) =>
    req.user!.role === 'TECHNICIAN' ? req.user!.userId : undefined;

// Roles allowed to read other people's hours. Everyone else (TECHNICIAN, and
// office-floor roles like SALES/CSR) only ever sees their own timesheet.
const CAN_READ_OTHERS = ['ADMIN', 'OFFICE', 'DISPATCHER', 'ACCOUNTANT'];

// The userId to list for. Privileged roles may filter by anyone (or leave it
// open for the whole team); everyone else is pinned to themselves.
const listScopeFor = (req: Request): string | undefined =>
    CAN_READ_OTHERS.includes(req.user!.role) ? (req.query.userId as string | undefined) : req.user!.userId;

export const timeTrackingController = {
    mySummary: async (req: Request, res: Response) => {
        const summary = await timeTrackingService.getMySummary(req.user!.companyId, req.user!.userId);
        res.status(StatusCodes.OK).json({ status: 'success', data: summary });
    },

    start: async (req: Request, res: Response) => {
        const data = startTimeEntrySchema.parse(req.body);
        const entry = await timeTrackingService.startEntry(req.user!.companyId, req.user!.userId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { entry } });
    },

    stop: async (req: Request, res: Response) => {
        const data = stopTimeEntrySchema.parse(req.body);
        const endTime = data.endTime ? new Date(data.endTime) : undefined;
        const entry = await timeTrackingService.stopEntry(req.params.id, req.user!.companyId, scopeFor(req), endTime);
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    update: async (req: Request, res: Response) => {
        const { reason, ...data } = updateTimeEntrySchema.parse(req.body);
        const entry = await timeTrackingService.updateEntry(
            req.params.id,
            req.user!.companyId,
            scopeFor(req),
            req.user!.userId,
            data,
            reason,
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    manual: async (req: Request, res: Response) => {
        const data = manualTimeEntrySchema.parse(req.body);
        const entry = await timeTrackingService.manualEntry(req.user!.companyId, req.user!.userId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { entry } });
    },

    getOne: async (req: Request, res: Response) => {
        const entry = await timeTrackingService.getOne(
            req.params.id,
            req.user!.companyId,
            req.user!.role === 'TECHNICIAN' ? req.user!.userId : undefined
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { entry } });
    },

    getAll: async (req: Request, res: Response) => {
        const result = await timeTrackingService.getAll(req.user!.companyId, {
            userId: listScopeFor(req),
            jobId: req.query.jobId as string | undefined,
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 50,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    exportCsv: async (req: Request, res: Response) => {
        const { rows, tz } = await timeTrackingService.exportRange(req.user!.companyId, {
            userId: listScopeFor(req),
            jobId: req.query.jobId as string | undefined,
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        });
        const csv = buildTimesheetCsv(rows, (d) => formatDateTimeInTimeZone(d, tz));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="labour-hours.csv"');
        res.status(StatusCodes.OK).send(csv);
    },

    delete: async (req: Request, res: Response) => {
        const { reason } = deleteTimeEntrySchema.parse(req.body ?? {});
        await timeTrackingService.deleteEntry(
            req.params.id,
            req.user!.companyId,
            scopeFor(req),
            req.user!.userId,
            reason,
        );
        res.status(StatusCodes.OK).json({ status: 'success' });
    }
};
