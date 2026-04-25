import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { paymentsService } from './payments.service';

export const paymentsController = {
    // --- Public (no auth) ---
    getPublicInvoice: async (req: Request, res: Response) => {
        const invoice = await paymentsService.getPublicInvoice(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    },

    createCheckoutSession: async (req: Request, res: Response) => {
        const session = await paymentsService.createCheckoutSession(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data: { session } });
    },

    // --- Authenticated ---
    getPayLink: async (req: Request, res: Response) => {
        const url = await paymentsService.getPayLinkForInvoice(
            req.params.invoiceId,
            req.user!.companyId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { url } });
    },

    recordManual: async (req: Request, res: Response) => {
        const body = z
            .object({
                amount: z.number().positive(),
                method: z.enum(['CASH', 'CHECK', 'OTHER']),
                note: z.string().optional(),
            })
            .parse(req.body);
        const result = await paymentsService.recordManualPayment({
            invoiceId: req.params.invoiceId,
            companyId: req.user!.companyId,
            ...body,
        });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },
};
