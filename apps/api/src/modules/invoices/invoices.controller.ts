import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { invoiceService } from './invoices.service';

// Masks a contact so a technician sees who the pay link went to without exposing
// the full email/phone. e.g. "jane@acme.co" -> "j***@acme.co", "+27821234567" -> "•••4567".
const maskContact = (customer: { email?: string | null; phone?: string | null }): string | null => {
    if (customer.email) {
        const [local, domain] = customer.email.split('@');
        if (domain) {
            const head = local.slice(0, 1);
            return `${head}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
        }
    }
    if (customer.phone) {
        const digits = customer.phone.replace(/\s+/g, '');
        return `•••${digits.slice(-4)}`;
    }
    return null;
};

export const invoiceController = {
    createFromJob: async (req: Request, res: Response) => {
        const invoice = await invoiceService.createFromJob(req.params.jobId, req.user!.companyId);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { invoice } });
    },

    // Field closeout money step. Technicians get a price-free response (only a
    // masked "sent to" indicator); office/admin also get the invoice.
    sendFieldInvoice: async (req: Request, res: Response) => {
        const result = await invoiceService.sendFieldInvoice(
            req.params.jobId,
            req.user!.companyId,
            { userId: req.user!.userId, role: req.user!.role }
        );
        const sentTo = maskContact(result.customer ?? {});

        if (req.user!.role === 'TECHNICIAN') {
            res.status(StatusCodes.OK).json({
                status: 'success',
                data: { sent: true, alreadyInvoiced: result.alreadyInvoiced, sentTo },
            });
            return;
        }

        res.status(StatusCodes.OK).json({
            status: 'success',
            data: {
                sent: true,
                alreadyInvoiced: result.alreadyInvoiced,
                sentTo,
                invoice: result.invoice,
            },
        });
    },

    // Bulk invoice generation from selected completed-uninvoiced jobs.
    bulkGenerate: async (req: Request, res: Response) => {
        const { jobIds } = z
            .object({ jobIds: z.array(z.string().min(1)).min(1).max(100) })
            .parse(req.body);
        const result = await invoiceService.bulkGenerateFromJobs(jobIds, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    getOne: async (req: Request, res: Response) => {
        const invoice = await invoiceService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    },

    getAll: async (req: Request, res: Response) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const status = req.query.status as string | undefined;
        const result = await invoiceService.getAll(req.user!.companyId, page, limit, status);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    send: async (req: Request, res: Response) => {
        const invoice = await invoiceService.send(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoice } });
    },

    getOverdue: async (req: Request, res: Response) => {
        const invoices = await invoiceService.getOverdue(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { invoices } });
    },

    getUninvoicedJobs: async (req: Request, res: Response) => {
        const jobs = await invoiceService.getUninvoicedJobs(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { jobs } });
    },

    sendReminder: async (req: Request, res: Response) => {
        const result = await invoiceService.sendReminder(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    sendBulkReminders: async (req: Request, res: Response) => {
        const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(req.body);
        const results = await invoiceService.sendBulkReminders(ids, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { results } });
    },

    softDelete: async (req: Request, res: Response) => {
        await invoiceService.softDelete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
