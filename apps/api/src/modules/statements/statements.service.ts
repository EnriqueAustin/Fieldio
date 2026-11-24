import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { emailService } from '../../services/notifications/email.service';

/**
 * Gather the statement figures and line detail for one customer over a period.
 * Shared by build (which persists a summary row) and detail/render (which
 * recomputes the same lines on demand for a stored statement).
 */
const gatherStatement = async (
    companyId: string,
    customerId: string,
    periodStart: Date,
    periodEnd: Date
) => {
    // Opening balance = invoices totalled before the period, less payments before it.
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

    return {
        openingBalance,
        invoicedTotal,
        paymentsTotal,
        creditsTotal,
        closingBalance,
        lines: { invoices, payments, credits },
    };
};

export const statementsService = {
    /**
     * Build a customer statement for a period (no PDF — we return data;
     * the client renders a printable HTML statement from it).
     */
    build: async (
        companyId: string,
        customerId: string,
        periodStart: Date,
        periodEnd: Date
    ) => {
        const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        const figures = await gatherStatement(companyId, customerId, periodStart, periodEnd);

        const statement = await prisma.customerStatement.create({
            data: {
                companyId,
                customerId,
                periodStart,
                periodEnd,
                openingBalance: figures.openingBalance,
                invoicedTotal: figures.invoicedTotal,
                paymentsTotal: figures.paymentsTotal,
                creditsTotal: figures.creditsTotal,
                closingBalance: figures.closingBalance,
            },
        });

        return { statement, customer, ...figures };
    },

    /**
     * Full statement for viewing/printing: the stored summary row plus the line
     * detail recomputed for its period, so the client can render a clean
     * printable HTML statement (no PDF library in use).
     */
    detail: async (companyId: string, statementId: string) => {
        const statement = await prisma.customerStatement.findFirst({
            where: { id: statementId, companyId },
            include: { customer: true },
        });
        if (!statement) throw new AppError('Statement not found', StatusCodes.NOT_FOUND);
        const figures = await gatherStatement(
            companyId,
            statement.customerId,
            new Date(statement.periodStart),
            new Date(statement.periodEnd)
        );
        return { statement, customer: (statement as any).customer, ...figures };
    },

    /**
     * Customers that currently carry an outstanding balance — the month-end
     * "statement run" worklist. Receivables = non-void, non-draft invoices with
     * a remaining balance, grouped by the job's customer.
     */
    customersWithBalance: async (companyId: string) => {
        const invoices = await prisma.invoice.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: { notIn: ['VOID', 'DRAFT'] },
                balance: { gt: 0 },
            },
            select: {
                balance: true,
                job: { select: { customerId: true, customer: { select: { id: true, name: true } } } },
            },
        });

        const byCustomer = new Map<string, { customerId: string; name: string; balance: number }>();
        for (const inv of invoices as any[]) {
            const customerId = inv.job?.customerId ?? inv.job?.customer?.id;
            if (!customerId) continue;
            const name = inv.job?.customer?.name ?? 'Customer';
            const entry = byCustomer.get(customerId) ?? { customerId, name, balance: 0 };
            entry.balance += Number(inv.balance);
            byCustomer.set(customerId, entry);
        }

        return [...byCustomer.values()]
            .filter((c) => c.balance > 0)
            .sort((a, b) => b.balance - a.balance);
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
