import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { emailService } from '../../services/notifications/email.service';

export const statementsService = {
    /**
     * Build a customer statement for a period (no PDF — we return data;
     * client can render or this can be wired to a PDF service later).
     */
    build: async (
        companyId: string,
        customerId: string,
        periodStart: Date,
        periodEnd: Date
    ) => {
        const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        // Opening balance = sum of invoice balances dated before periodStart
        const priorInvoices = await prisma.invoice.findMany({
            where: { companyId, deletedAt: null, createdAt: { lt: periodStart }, job: { customerId } },
            select: { total: true },
        });
        const priorPayments = await prisma.payment.findMany({
            where: { companyId, status: 'SUCCEEDED', createdAt: { lt: periodStart }, invoice: { job: { customerId } } },
            select: { amount: true },
        });
        const openingBalance = priorInvoices.reduce((s, i) => s + Number(i.total), 0)
            - priorPayments.reduce((s, p) => s + Number(p.amount), 0);

        const invoices = await prisma.invoice.findMany({
            where: { companyId, deletedAt: null, createdAt: { gte: periodStart, lte: periodEnd }, job: { customerId } },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, invoiceNumber: true, total: true, balance: true, dueDate: true, createdAt: true, status: true,
            },
        });
        const payments = await prisma.payment.findMany({
            where: { companyId, status: 'SUCCEEDED', createdAt: { gte: periodStart, lte: periodEnd }, invoice: { job: { customerId } } },
            orderBy: { createdAt: 'asc' },
            select: { id: true, amount: true, method: true, createdAt: true, invoiceId: true },
        });
        const credits = await prisma.creditNote.findMany({
            where: { companyId, customerId, status: { in: ['ISSUED', 'APPLIED'] }, createdAt: { gte: periodStart, lte: periodEnd } },
            select: { id: true, number: true, total: true, createdAt: true, status: true },
        });

        const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total), 0);
        const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
        const creditsTotal = credits.reduce((s, c) => s + Number(c.total), 0);
        const closingBalance = openingBalance + invoicedTotal - paymentsTotal - creditsTotal;

        const statement = await prisma.customerStatement.create({
            data: {
                companyId,
                customerId,
                periodStart,
                periodEnd,
                openingBalance,
                invoicedTotal,
                paymentsTotal,
                creditsTotal,
                closingBalance,
            },
        });

        return {
            statement,
            customer,
            openingBalance,
            invoicedTotal,
            paymentsTotal,
            creditsTotal,
            closingBalance,
            lines: {
                invoices,
                payments,
                credits,
            },
        };
    },

    email: async (companyId: string, statementId: string) => {
        const s = await prisma.customerStatement.findFirst({
            where: { id: statementId, companyId },
            include: { customer: true },
        });
        if (!s) throw new AppError('Statement not found', StatusCodes.NOT_FOUND);
        if (!s.customer.email) throw new AppError('Customer has no email', StatusCodes.BAD_REQUEST);
        const body = `Statement period: ${s.periodStart.toDateString()} → ${s.periodEnd.toDateString()}
Opening balance: R ${Number(s.openingBalance).toFixed(2)}
Invoiced: R ${Number(s.invoicedTotal).toFixed(2)}
Payments: R ${Number(s.paymentsTotal).toFixed(2)}
Credits: R ${Number(s.creditsTotal).toFixed(2)}
Closing balance: R ${Number(s.closingBalance).toFixed(2)}`;
        await emailService.sendRaw(s.customer.email, `Statement of account`, body, companyId);
        await prisma.customerStatement.update({ where: { id: s.id }, data: { emailedAt: new Date() } });
    },

    list: (companyId: string, customerId?: string) =>
        prisma.customerStatement.findMany({
            where: { companyId, ...(customerId && { customerId }) },
            include: { customer: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        }),
};
