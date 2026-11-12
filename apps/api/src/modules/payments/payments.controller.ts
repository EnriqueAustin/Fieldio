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

    createPayFastCheckout: async (req: Request, res: Response) => {
        const session = await paymentsService.createPayFastCheckout(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data: { session } });
    },

    handlePayFastITN: async (req: Request, res: Response) => {
        // req.ip honours the app's `trust proxy` setting; a raw X-Forwarded-For
        // header is client-controlled and must never be trusted directly.
        const result = await paymentsService.handlePayFastITN(req.body ?? {}, req.ip);
        res.status(result.received ? StatusCodes.OK : StatusCodes.BAD_REQUEST)
            .send(result.received ? 'OK' : 'FAIL');
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
                method: z.enum(['CASH', 'CHECK', 'EFT', 'OTHER']),
                reference: z.string().max(100).optional(),
                note: z.string().optional(),
                // Effective date the money was received (office form). Accepts a
                // yyyy-mm-dd or a full ISO datetime; stored in Payment.metadata.paidAt.
                paidAt: z.string().optional(),
            })
            .parse(req.body);
        const result = await paymentsService.recordManualPayment({
            invoiceId: req.params.invoiceId,
            companyId: req.user!.companyId,
            ...body,
        });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },

    // Reverse a recorded payment (ADMIN / OFFICE / ACCOUNTANT). Recomputes the
    // invoice balance from the remaining completed payments.
    reverse: async (req: Request, res: Response) => {
        const { reason } = z
            .object({ reason: z.string().trim().min(3).max(500) })
            .parse(req.body);
        const result = await paymentsService.reversePayment({
            paymentId: req.params.paymentId,
            companyId: req.user!.companyId,
            reason,
            actor: { userId: req.user!.userId, role: req.user!.role },
        });
        res.status(StatusCodes.OK).json({
            status: 'success',
            data: { payment: result.payment, invoice: result.invoice },
        });
    },

    // Bulk EFT reconciliation — dry-run matching of pasted/uploaded statement lines.
    bulkMatch: async (req: Request, res: Response) => {
        const { lines } = z
            .object({
                lines: z
                    .array(
                        z.object({
                            date: z.string().optional(),
                            amount: z.number().positive(),
                            reference: z.string().optional(),
                        })
                    )
                    .min(1)
                    .max(500),
            })
            .parse(req.body);
        const result = await paymentsService.bulkMatchEft(req.user!.companyId, lines);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    // Bulk EFT reconciliation — apply confirmed matches.
    bulkRecord: async (req: Request, res: Response) => {
        const { matches } = z
            .object({
                matches: z
                    .array(
                        z.object({
                            invoiceId: z.string().min(1),
                            amount: z.number().positive(),
                            reference: z.string().optional(),
                        })
                    )
                    .min(1)
                    .max(500),
            })
            .parse(req.body);
        const result = await paymentsService.bulkRecordEft(req.user!.companyId, matches);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },
};
