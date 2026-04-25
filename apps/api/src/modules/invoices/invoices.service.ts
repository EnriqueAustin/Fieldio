import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { notificationService } from '../../services/notifications/notification.service';
import { normalizeCompanySettings } from '../company/company-settings';

export const invoiceService = {
    createFromJob: async (jobId: string, companyId: string) => {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: { id: jobId, companyId },
                include: { lineItems: true, invoice: true, customer: true, company: true }
            });

            if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
            if (job.invoice) throw new AppError('Job already invoiced', StatusCodes.BAD_REQUEST);

            const subtotal = job.lineItems.reduce((acc, item) => acc + Number(item.total), 0);
            const settings = normalizeCompanySettings(job.company.settings);
            const taxRate = settings.billing.taxRate / 100;
            const tax = subtotal * taxRate;
            const total = subtotal + tax;

            const invoice = await tx.invoice.create({
                data: {
                    companyId,
                    jobId: job.id,
                    items: job.lineItems as any,
                    subtotal,
                    tax,
                    total,
                    balance: total,
                    status: 'DRAFT',
                    dueDate: new Date(Date.now() + settings.billing.paymentTermsDays * 24 * 60 * 60 * 1000),
                },
            });

            return invoice;
        });
    },

    /**
     * Mark invoice as SENT and email pay link to customer.
     */
    send: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId },
            include: { job: { include: { customer: true } } },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);

        const updated = await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status },
        });

        await notificationService.notifyCustomer(
            invoice.job.customerId,
            companyId,
            'INVOICE_SENT',
            { invoiceId: invoice.id, total: Number(invoice.total) }
        );

        return updated;
    },

    getOne: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId },
            include: {
                job: { include: { customer: true, property: true } },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        return invoice;
    },

    getAll: async (companyId: string) => {
        return prisma.invoice.findMany({
            where: { companyId },
            include: { job: { include: { customer: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
        });
    },
};
