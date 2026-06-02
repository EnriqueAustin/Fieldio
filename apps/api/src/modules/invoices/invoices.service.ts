import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { notificationService } from '../../services/notifications/notification.service';
import { normalizeCompanySettings } from '../company/company-settings';

export const invoiceService = {
    createFromJob: async (jobId: string, companyId: string) => {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: { id: jobId, companyId, deletedAt: null },
                include: { lineItems: true, invoice: true, customer: true, company: true },
            });

            if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
            if (job.invoice) throw new AppError('Job already invoiced', StatusCodes.BAD_REQUEST);

            const subtotal = job.lineItems.reduce((acc, item) => acc + Number(item.total), 0);
            const settings = normalizeCompanySettings(job.company.settings);
            const taxRate = settings.billing.taxRate / 100;
            const tax = subtotal * taxRate;
            const total = subtotal + tax;
            const invoiceCount = await tx.invoice.count({ where: { companyId } });
            const invoiceNumber = `${settings.billing.eftDetails.referencePrefix || 'INV'}-${String(invoiceCount + 1).padStart(5, '0')}`;

            const invoice = await tx.invoice.create({
                data: {
                    companyId,
                    jobId: job.id,
                    invoiceNumber,
                    items: job.lineItems as any,
                    subtotal,
                    tax,
                    total,
                    balance: total,
                    taxLabel: settings.billing.taxLabel,
                    taxRate: settings.billing.taxRate,
                    taxNumber: settings.billing.taxNumber || null,
                    supplierName: job.company.name,
                    supplierCompanyRegistration: settings.billing.companyRegistrationNumber || null,
                    paymentReference: invoiceNumber,
                    status: 'DRAFT',
                    dueDate: new Date(Date.now() + settings.billing.paymentTermsDays * 24 * 60 * 60 * 1000),
                },
            });

            return invoice;
        });
    },

    send: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId, deletedAt: null },
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
            {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                total: Number(invoice.total),
            }
        );

        return updated;
    },

    getOne: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId, deletedAt: null },
            include: {
                job: {
                    include: {
                        customer: true,
                        property: true,
                        tech: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        return invoice;
    },

    getAll: async (companyId: string, page = 1, limit = 20, status?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId, deletedAt: null };
        if (status) where.status = status;

        const [items, total] = await Promise.all([
            prisma.invoice.findMany({
                where,
                skip,
                take: limit,
                include: { job: { include: { customer: { select: { name: true } } } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.invoice.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    getOverdue: async (companyId: string) => {
        const invoices = await prisma.invoice.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: { in: ['SENT', 'OVERDUE'] },
                dueDate: { lt: new Date() },
                balance: { gt: 0 },
            },
            include: {
                job: {
                    include: {
                        customer: { select: { id: true, name: true, email: true, phone: true } },
                    },
                },
            },
            orderBy: { dueDate: 'asc' },
        });

        await prisma.invoice.updateMany({
            where: {
                id: { in: invoices.filter(i => i.status === 'SENT').map(i => i.id) },
            },
            data: { status: 'OVERDUE' },
        });

        return invoices;
    },

    sendReminder: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { job: { include: { customer: true } } },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);

        await notificationService.notifyCustomer(
            invoice.job.customerId,
            companyId,
            'INVOICE_SENT',
            {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                total: Number(invoice.balance),
            }
        );

        return { sent: true };
    },

    sendBulkReminders: async (ids: string[], companyId: string) => {
        const results: { id: string; sent: boolean; error?: string }[] = [];
        for (const id of ids) {
            try {
                await invoiceService.sendReminder(id, companyId);
                results.push({ id, sent: true });
            } catch (e: any) {
                results.push({ id, sent: false, error: e.message });
            }
        }
        return results;
    },

    softDelete: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        if (invoice.status === 'PAID') throw new AppError('Cannot void a paid invoice', StatusCodes.BAD_REQUEST);

        await prisma.invoice.update({
            where: { id },
            data: { deletedAt: new Date(), status: 'VOID' },
        });
        return { deleted: true };
    },
};
