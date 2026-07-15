import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { prisma } from '@fieldio/database';
import { StatusCodes } from 'http-status-codes';

export const sageExportRouter = Router();

sageExportRouter.use(requireUser);
sageExportRouter.use(restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'));

// Parse a comma-separated `ids` query param into a de-duplicated string list.
const parseIds = (raw: unknown): string[] | null => {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return ids.length ? Array.from(new Set(ids)) : null;
};

sageExportRouter.get('/sage/invoices', catchAsync(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const companyId = req.user!.companyId;

    const where: any = { companyId, deletedAt: null };
    // Re-export of a specific selection (from the reconciliation view) takes
    // precedence over the date range.
    const ids = parseIds(req.query.ids);
    if (ids) {
        where.id = { in: ids };
    } else if (from || to) {
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

    // Stamp export tracking (G-5): every included invoice gets exportedAt = now
    // and a shared batch id, so the reconciliation view can tell exported from
    // not-yet-exported and flag changed-since-export.
    if (invoices.length > 0) {
        const exportBatchId = crypto.randomUUID();
        await prisma.invoice.updateMany({
            where: { companyId, id: { in: invoices.map((i) => i.id) } },
            data: { exportedAt: new Date(), exportBatchId },
        });
    }

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
    const ids = parseIds(req.query.ids);
    if (ids) {
        where.id = { in: ids };
    } else if (from || to) {
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

    // Stamp export tracking (G-5) on the exported expenses.
    if (expenses.length > 0) {
        const exportBatchId = crypto.randomUUID();
        await prisma.expense.updateMany({
            where: { companyId, id: { in: expenses.map((e) => e.id) } },
            data: { exportedAt: new Date(), exportBatchId },
        });
    }

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

// Small clock skew allowance: stamping exportedAt also bumps @updatedAt in the
// same write, so a just-exported invoice can show updatedAt a few ms after
// exportedAt. Only treat edits beyond this window as "modified since export".
const MODIFIED_TOLERANCE_MS = 2000;

/**
 * Sage reconciliation view (G-5): for a date range, bucket invoices into
 *   - notExported        → never included in a Sage export
 *   - clean              → exported and unchanged since
 *   - modifiedSinceExport→ edited after being exported (needs re-export)
 *   - paidAfterExport    → payment landed after the export (Sage AR is stale)
 * VOID/DRAFT invoices are excluded (nothing to reconcile).
 */
sageExportRouter.get('/sage/reconciliation', catchAsync(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    const companyId = req.user!.companyId;

    const where: any = { companyId, deletedAt: null, status: { notIn: ['VOID', 'DRAFT'] } };
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from as string);
        if (to) where.createdAt.lte = new Date(to as string);
    }

    const invoices = await prisma.invoice.findMany({
        where,
        include: { job: { select: { title: true, customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
    });

    const view = (inv: (typeof invoices)[number]) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.job?.customer?.name ?? null,
        jobTitle: inv.job?.title ?? null,
        total: Number(inv.total),
        balance: Number(inv.balance),
        status: inv.status,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        exportedAt: inv.exportedAt,
        exportBatchId: inv.exportBatchId,
        paidAt: inv.paidAt,
        reconciledAt: inv.reconciledAt,
    });

    const notExported: any[] = [];
    const clean: any[] = [];
    const modifiedSinceExport: any[] = [];
    const paidAfterExport: any[] = [];

    for (const inv of invoices) {
        if (!inv.exportedAt) {
            notExported.push(view(inv));
            continue;
        }
        const exportedTime = inv.exportedAt.getTime();
        const paidAfter = inv.paidAt && inv.paidAt.getTime() > exportedTime + MODIFIED_TOLERANCE_MS;
        const modifiedAfter = inv.updatedAt.getTime() > exportedTime + MODIFIED_TOLERANCE_MS;
        if (paidAfter) {
            paidAfterExport.push(view(inv));
        } else if (modifiedAfter) {
            modifiedSinceExport.push(view(inv));
        } else {
            clean.push(view(inv));
        }
    }

    res.status(StatusCodes.OK).json({
        status: 'success',
        data: {
            summary: {
                total: invoices.length,
                notExported: notExported.length,
                clean: clean.length,
                modifiedSinceExport: modifiedSinceExport.length,
                paidAfterExport: paidAfterExport.length,
            },
            notExported,
            clean,
            modifiedSinceExport,
            paidAfterExport,
        },
    });
}));

/**
 * Mark selected invoices as reconciled (stamps reconciledAt). Lightweight
 * acknowledgement that the office has squared these against Sage — no heavy
 * ledger modelling, just a nullable timestamp.
 */
sageExportRouter.post('/sage/reconcile', catchAsync(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId;
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
        return res.status(StatusCodes.BAD_REQUEST).json({ status: 'fail', message: 'ids must be a non-empty string array' });
    }

    const result = await prisma.invoice.updateMany({
        where: { companyId, id: { in: ids as string[] }, deletedAt: null },
        data: { reconciledAt: new Date() },
    });

    res.status(StatusCodes.OK).json({ status: 'success', data: { reconciled: result.count } });
}));
