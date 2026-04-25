import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
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

    deactivate: async (req: Request, res: Response) => {
        await recurringService.deactivate(req.params.id, req.user!.companyId);
        res.status(StatusCodes.NO_CONTENT).send();
    },
};
