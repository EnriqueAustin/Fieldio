import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../middleware/error';
import { recurringService } from './recurring.service';

const createSchema = z.object({
    customerId: z.string().uuid(),
    propertyId: z.string().uuid(),
    title: z.string().min(2),
    description: z.string().optional(),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
    template: z.any().optional(),
});

const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;

const updateSchema = z
    .object({
        title: z.string().trim().min(2).max(200),
        description: z.string().max(5000).nullable(),
        frequency: z.enum(FREQUENCIES),
        nextRunAt: z.string().datetime(),
        endDate: z.string().datetime().nullable(),
        active: z.boolean(),
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const recurringController = {
    list: async (req: Request, res: Response) => {
        const plans = await recurringService.list(req.user!.companyId);
        res.json({ status: 'success', data: { plans } });
    },

    create: async (req: Request, res: Response) => {
        const body = createSchema.parse(req.body);
        const plan = await recurringService.create({
            companyId: req.user!.companyId,
            ...body,
            startDate: new Date(body.startDate),
            endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { plan } });
    },

    update: async (req: Request, res: Response) => {
        const body = updateSchema.parse(req.body);
        // Deactivate/reactivate is ADMIN/OFFICE only, matching DELETE /:id.
        if (body.active !== undefined && !['ADMIN', 'OFFICE'].includes(req.user!.role)) {
            throw new AppError('Only admins and office staff can activate or deactivate plans', StatusCodes.FORBIDDEN);
        }
        const plan = await recurringService.update(req.params.id, req.user!.companyId, {
            ...body,
            nextRunAt: body.nextRunAt ? new Date(body.nextRunAt) : undefined,
            endDate: body.endDate === undefined ? undefined : body.endDate === null ? null : new Date(body.endDate),
        });
        res.json({ status: 'success', data: { plan } });
    },

    runDue: async (req: Request, res: Response) => {
        const { created, failed } = await recurringService.runDuePlans(req.user!.companyId);
        res.json({ status: 'success', data: { created, failed } });
    },

    deactivate: async (req: Request, res: Response) => {
        await recurringService.deactivate(req.params.id, req.user!.companyId);
        res.status(StatusCodes.NO_CONTENT).send();
    },
};
