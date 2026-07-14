import { Router, Request, Response } from 'express';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { prisma } from '@fieldio/database';
import { StatusCodes } from 'http-status-codes';

export const sageExportRouter = Router();

sageExportRouter.use(requireUser);
sageExportRouter.use(restrictTo('ADMIN', 'OFFICE'));

sageExportRouter.get('/sage/invoices', catchAsync(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const companyId = req.user!.companyId;

    const where: any = { companyId, deletedAt: null };
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from as string);
        if (to) where.createdAt.lte = new Date(to as string);
    }

    const invoices = await prisma.invoice.findMany({
        where,
        include: {
            job: {
                select: {
                    title: true,
                    customer: { select: { name: true } },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const header = 'InvoiceNumber,Date,DueDate,CustomerName,Description,Subtotal,TaxRate,TaxAmount,Total,Balance,Status,TaxLabel,TaxNumber,PaymentReference';
    const rows = invoices.map(inv => {
        const customer = inv.job?.customer?.name ?? '';
        const desc = inv.job?.title ?? '';
        return [
            inv.invoiceNumber ?? '',
            inv.createdAt.toISOString().split('T')[0],
            inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : '',
            `"${customer.replace(/"/g, '""')}"`,
            `"${desc.replace(/"/g, '""')}"`,
            Number(inv.subtotal).toFixed(2),
            Number(inv.taxRate).toFixed(2),
            Number(inv.tax).toFixed(2),
            Number(inv.total).toFixed(2),
            Number(inv.balance).toFixed(2),
            inv.status,
            inv.taxLabel,
            inv.taxNumber ?? '',
            inv.paymentReference ?? '',
        ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sage-invoices-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(StatusCodes.OK).send(csv);
}));

sageExportRouter.get('/sage/expenses', catchAsync(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const companyId = req.user!.companyId;

    const where: any = { companyId };
    if (from || to) {
        where.date = {};
        if (from) where.date.gte = new Date(from as string);
        if (to) where.date.lte = new Date(to as string);
    }

    const expenses = await prisma.expense.findMany({
        where,
        include: {
            job: {
                select: {
                    title: true,
                    customer: { select: { name: true } },
                },
            },
        },
        orderBy: { date: 'asc' },
    });

    const header = 'Date,Description,Amount,Category,JobTitle,CustomerName,ReceiptUrl';
    const rows = expenses.map(exp => {
        return [
            exp.date.toISOString().split('T')[0],
            `"${exp.description.replace(/"/g, '""')}"`,
            Number(exp.amount).toFixed(2),
            (exp as any).category ?? 'OTHER',
            `"${(exp.job?.title ?? '').replace(/"/g, '""')}"`,
            `"${(exp.job?.customer?.name ?? '').replace(/"/g, '""')}"`,
            exp.receiptUrl ?? '',
        ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sage-expenses-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(StatusCodes.OK).send(csv);
}));

sageExportRouter.get('/sage/customers', catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId;

    const customers = await prisma.customer.findMany({
        where: { companyId, deletedAt: null },
        include: {
            properties: { take: 1, orderBy: { id: 'asc' } },
        },
        orderBy: { name: 'asc' },
    });

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = 'Name,Email,Phone,AddressLine1,AddressLine2,City,Province,PostalCode,Status,Notes';
    const rows = customers.map(c => {
        const p = c.properties[0];
        return [
            esc(c.name),
            c.email ?? '',
            c.phone ?? '',
            esc(p?.addressLine1 ?? ''),
            esc(p?.addressLine2 ?? ''),
            esc(p?.city ?? ''),
            esc(p?.state ?? ''),
            p?.zip ?? '',
            c.status,
            esc(c.notes ?? ''),
        ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sage-customers-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(StatusCodes.OK).send(csv);
}));

sageExportRouter.get('/sage/job-costing', catchAsync(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const companyId = req.user!.companyId;

    const where: any = { companyId, deletedAt: null };
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from as string);
        if (to) where.createdAt.lte = new Date(to as string);
    }

    const jobs = await prisma.job.findMany({
        where,
        include: {
            customer: { select: { name: true } },
            lineItems: true,
            expenses: true,
            invoice: { select: { total: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const header = 'JobTitle,CustomerName,Status,MaterialsCost,LaborRevenue,ServiceRevenue,TotalRevenue,Expenses,InvoiceTotal,InvoiceStatus,Margin';
    const rows = jobs.map(job => {
        const materialsCost = job.lineItems
            .filter(li => li.type === 'MATERIAL')
            .reduce((s, li) => s + Number(li.total), 0);
        const laborRevenue = job.lineItems
            .filter(li => li.type === 'LABOR')
            .reduce((s, li) => s + Number(li.total), 0);
        const serviceRevenue = job.lineItems
            .filter(li => li.type === 'SERVICE')
            .reduce((s, li) => s + Number(li.total), 0);
        const totalRevenue = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
        const totalExpenses = job.expenses.reduce((s, e) => s + Number(e.amount), 0);
        const invoiceTotal = job.invoice ? Number(job.invoice.total) : 0;
        const margin = totalRevenue - materialsCost - totalExpenses;

        return [
            `"${job.title.replace(/"/g, '""')}"`,
            `"${(job.customer?.name ?? '').replace(/"/g, '""')}"`,
            job.status,
            materialsCost.toFixed(2),
            laborRevenue.toFixed(2),
            serviceRevenue.toFixed(2),
            totalRevenue.toFixed(2),
            totalExpenses.toFixed(2),
            invoiceTotal.toFixed(2),
            job.invoice?.status ?? 'NO_INVOICE',
            margin.toFixed(2),
        ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sage-job-costing-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(StatusCodes.OK).send(csv);
}));
