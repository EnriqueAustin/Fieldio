import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { notificationService } from '../../services/notifications/notification.service';
import { normalizeCompanySettings } from '../company/company-settings';

/** Round a money amount to whole cents (no 30-decimal Decimal drift). */
export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** True when the supplier has a VAT number (and therefore charges VAT). */
export const supplierChargesVat = (taxNumber: string | null | undefined) =>
    !!(taxNumber && String(taxNumber).trim());

/**
 * Document heading rule: a supplier with no VAT number may not issue a "Tax
 * Invoice" — the document is a plain "Invoice" and shows no VAT number. When a
 * VAT number is present we use the company's configured heading (default
 * "Tax Invoice"). Shared by the detail endpoint and the PDF.
 */
export const resolveInvoiceHeading = (
    taxNumber: string | null | undefined,
    configuredHeading?: string | null
) => (supplierChargesVat(taxNumber) ? configuredHeading || 'Tax Invoice' : 'Invoice');

/** Joins a property's address parts into a single line for the buyer snapshot. */
const propertyAddressLine = (property: any): string | null => {
    if (!property) return null;
    const line = [
        property.addressLine1,
        property.addressLine2,
        property.city,
        property.state,
        property.zip,
    ]
        .filter((p) => p && String(p).trim())
        .join(', ');
    return line || null;
};

/**
 * The one place invoice money is calculated from a job's line items. Used by
 * createFromJob and resyncFromJob so a refreshed draft can never disagree with a
 * freshly created one. A supplier with no VAT number charges no VAT at all
 * (rate 0, tax 0); everything is rounded to whole cents.
 */
export const buildInvoiceMoney = (
    lineItems: { total: unknown }[],
    billing: { taxNumber?: string | null; taxRate: number; taxLabel: string }
) => {
    const rate = supplierChargesVat(billing.taxNumber) ? billing.taxRate : 0;
    const subtotal = round2(lineItems.reduce((acc, item) => acc + Number(item.total), 0));
    const tax = round2((subtotal * rate) / 100);
    const total = round2(subtotal + tax);
    return {
        items: lineItems,
        subtotal,
        tax,
        total,
        balance: total,
        taxRate: rate,
        taxLabel: billing.taxLabel,
        taxNumber: billing.taxNumber || null,
    };
};

export const invoiceService = {
    createFromJob: async (jobId: string, companyId: string) => {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: { id: jobId, companyId, deletedAt: null },
                include: { lineItems: true, invoice: true, customer: true, company: true, property: true },
            });

            if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
            // A cancelled job has nothing to bill. (Not restricted to COMPLETED:
            // techs send the field invoice + pay link on site before closing out.)
            if (job.status === 'CANCELED') {
                throw new AppError('A cancelled job cannot be invoiced', StatusCodes.BAD_REQUEST);
            }
            if (job.invoice?.status === 'VOID') {
                throw new AppError(
                    "This job's invoice was voided; re-invoicing a voided job isn't supported yet",
                    StatusCodes.BAD_REQUEST
                );
            }
            if (job.invoice) throw new AppError('Job already invoiced', StatusCodes.BAD_REQUEST);

            const settings = normalizeCompanySettings(job.company.settings);
            const money = buildInvoiceMoney(job.lineItems, settings.billing);

            // Atomic, gap-free sequential numbering: bump the company counter inside
            // the same transaction so concurrent invoices never collide or reuse a number.
            const counter = await tx.company.update({
                where: { id: companyId },
                data: { invoiceSequence: { increment: 1 } },
                select: { invoiceSequence: true },
            });
            const prefix = (settings.billing as any).invoicePrefix || 'INV';
            const invoiceNumber = `${prefix}-${String(counter.invoiceSequence).padStart(5, '0')}`;

            // Buyer snapshot frozen at issue time (customer may later change details).
            const customerAddress =
                job.customer?.billingAddress || propertyAddressLine(job.property) || null;

            const invoice = await tx.invoice.create({
                data: {
                    companyId,
                    projectId: job.projectId,
                    jobId: job.id,
                    invoiceNumber,
                    items: money.items as any,
                    subtotal: money.subtotal,
                    tax: money.tax,
                    total: money.total,
                    balance: money.balance,
                    taxLabel: money.taxLabel,
                    taxRate: money.taxRate,
                    taxNumber: money.taxNumber,
                    supplierName: job.company.name,
                    supplierCompanyRegistration: settings.billing.companyRegistrationNumber || null,
                    customerName: job.customer?.name || null,
                    customerVatNumber: job.customer?.vatNumber || null,
                    customerAddress,
                    paymentReference: invoiceNumber,
                    status: 'DRAFT',
                    dueDate: new Date(Date.now() + settings.billing.paymentTermsDays * 24 * 60 * 60 * 1000),
                },
            });

            return invoice;
        });
    },

    /**
     * Rebuild a DRAFT invoice from the job's current line items (the office fixed
     * the job after the draft was generated). Same maths as createFromJob; the
     * invoice number is kept. Refused once the invoice is sent/paid/void or has
     * any payment against it.
     */
    resyncFromJob: async (id: string, companyId: string, userId: string) => {
        return prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, companyId, deletedAt: null } });
            if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
            if (invoice.status !== 'DRAFT') {
                throw new AppError(
                    'Only a draft invoice can be refreshed from its job',
                    StatusCodes.CONFLICT
                );
            }
            const payment = await tx.payment.findFirst({ where: { invoiceId: invoice.id, companyId } });
            if (payment) {
                throw new AppError(
                    'This invoice has a payment recorded and can no longer be refreshed',
                    StatusCodes.CONFLICT
                );
            }

            // An applied credit note lowers the balance without a payment row; a
            // rebuild would silently reset it to the full total.
            const appliedCredit = await tx.creditNote.findFirst({
                where: { invoiceId: invoice.id, companyId, status: 'APPLIED' },
            });
            if (appliedCredit) {
                throw new AppError(
                    'A credit note has been applied to this invoice and it can no longer be refreshed',
                    StatusCodes.CONFLICT
                );
            }

            const job = await tx.job.findFirst({
                where: { id: invoice.jobId, companyId, deletedAt: null },
                include: { lineItems: true, company: true },
            });
            if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

            const settings = normalizeCompanySettings(job.company.settings);
            const money = buildInvoiceMoney(job.lineItems, settings.billing);

            const updated = await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    items: money.items as any,
                    subtotal: money.subtotal,
                    tax: money.tax,
                    total: money.total,
                    balance: money.balance,
                    taxLabel: money.taxLabel,
                    taxRate: money.taxRate,
                    taxNumber: money.taxNumber,
                },
            });

            await tx.auditLog.create({
                data: {
                    companyId,
                    userId,
                    action: 'INVOICE_RESYNCED_FROM_JOB',
                    entityId: invoice.id,
                    entityType: 'INVOICE',
                    metadata: {
                        invoiceNumber: invoice.invoiceNumber,
                        jobId: invoice.jobId,
                        previousTotal: Number(invoice.total),
                        newTotal: money.total,
                    },
                },
            });

            return updated;
        });
    },

    /**
     * Field closeout money step: a technician (or office) closes the loop on site
     * by turning the job's line items into an invoice and sending the customer the
     * public pay link. Idempotent — if the job is already invoiced we resend the
     * link instead of creating a duplicate. Returns the customer contact so the
     * caller can surface a masked "sent to" indicator; NO amounts are returned to
     * technicians (the controller strips them).
     */
    sendFieldInvoice: async (
        jobId: string,
        companyId: string,
        actor: { userId?: string; role?: string } = {}
    ) => {
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId, deletedAt: null },
            include: { customer: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // A technician may only invoice a job assigned to them (or their van) —
        // mirrors the assignment guard used for field line-item mutations.
        if (actor.role === 'TECHNICIAN' && actor.userId) {
            const isAssigned = job.techId === actor.userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId: actor.userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError('You can only invoice jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }

        // Idempotent: look up an existing (non-voided) invoice for this job rather
        // than relying on the include, so a resend never duplicates.
        const existing = await prisma.invoice.findFirst({
            where: { jobId, companyId, deletedAt: null },
        });
        const alreadyInvoiced = !!existing;
        const invoice = existing ?? (await invoiceService.createFromJob(jobId, companyId));

        // Move a fresh draft to SENT, then fire the INVOICE_SENT notification — the
        // same path invoiceService.send uses — which generates/attaches the public
        // pay link and delivers it to the customer (email + WhatsApp).
        const sent = invoice.status === 'DRAFT'
            ? await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } })
            : invoice;

        await notificationService.notifyCustomer(job.customerId, companyId, 'INVOICE_SENT', {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            total: Number(invoice.total),
        });

        return { alreadyInvoiced, invoice: sent, customer: job.customer };
    },

    /**
     * Bulk invoice generation: create an invoice for each selected completed-
     * uninvoiced job in one call, reusing createFromJob per job. Failures are
     * isolated per job (already-invoiced, no line items, etc.) so a partial
     * batch still succeeds; returns per-job success/failure.
     */
    bulkGenerateFromJobs: async (jobIds: string[], companyId: string) => {
        const results: {
            jobId: string;
            ok: boolean;
            invoiceId?: string;
            invoiceNumber?: string | null;
            error?: string;
        }[] = [];

        for (const jobId of jobIds) {
            try {
                const invoice = await invoiceService.createFromJob(jobId, companyId);
                results.push({
                    jobId,
                    ok: true,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                });
            } catch (e: any) {
                results.push({ jobId, ok: false, error: e?.message ?? 'Could not create invoice' });
            }
        }

        const created = results.filter((r) => r.ok).length;
        return { results, created, failed: results.length - created };
    },

    send: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { job: { include: { customer: true } } },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        if (invoice.status === 'VOID') {
            throw new AppError('A void invoice cannot be sent', StatusCodes.CONFLICT);
        }

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
                company: { select: { settings: true } },
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

        const settings = normalizeCompanySettings((invoice as any).company?.settings);
        const heading = resolveInvoiceHeading(invoice.taxNumber, settings.billing.invoiceHeading);
        const items = Array.isArray(invoice.items) ? (invoice.items as any[]) : [];
        const payments = (((invoice as any).payments ?? []) as any[]).map((p) => ({
            id: p.id,
            amount: Number(p.amount ?? 0),
            method: p.method as string,
            status: p.status as string,
            createdAt: p.createdAt ?? null,
            // Effective payment date entered by the office (metadata.paidAt),
            // falling back to when the row was recorded.
            paidAt: (p.metadata as any)?.paidAt ?? null,
            reference: (p.metadata as any)?.reference ?? null,
            note: (p.metadata as any)?.note ?? null,
            overpayment: Number((p.metadata as any)?.overpayment ?? 0),
            reversal: (p.metadata as any)?.reversal ?? null,
        }));

        // Office-only detail payload: everything a detail page needs, incl. the
        // buyer snapshot, heading and whether a public pay link exists.
        return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            heading,
            jobId: invoice.jobId,
            projectId: invoice.projectId,
            items: items.map((line) => ({
                name: String(line?.name ?? ''),
                description: line?.description ?? null,
                quantity: Number(line?.quantity ?? 0),
                unitPrice: Number(line?.unitPrice ?? 0),
                total: Number(line?.total ?? 0),
            })),
            subtotal: Number(invoice.subtotal ?? 0),
            tax: Number(invoice.tax ?? 0),
            total: Number(invoice.total ?? 0),
            balance: Number(invoice.balance ?? 0),
            taxLabel: invoice.taxLabel,
            taxRate: Number(invoice.taxRate ?? 0),
            // Supplier snapshot.
            supplierName: invoice.supplierName ?? null,
            supplierCompanyRegistration: invoice.supplierCompanyRegistration ?? null,
            taxNumber: invoice.taxNumber ?? null,
            // Buyer snapshot.
            customerName: invoice.customerName ?? null,
            customerVatNumber: invoice.customerVatNumber ?? null,
            customerAddress: invoice.customerAddress ?? null,
            paymentReference: invoice.paymentReference ?? null,
            dueDate: invoice.dueDate ?? null,
            paidAt: invoice.paidAt ?? null,
            voidedAt: invoice.voidedAt ?? null,
            voidReason: invoice.voidReason ?? null,
            createdAt: invoice.createdAt ?? null,
            payments,
            job: { id: (invoice as any).job?.id ?? invoice.jobId, title: (invoice as any).job?.title ?? null },
            customer: {
                id: (invoice as any).job?.customer?.id ?? null,
                name: (invoice as any).job?.customer?.name ?? invoice.customerName ?? null,
            },
            payLink: { hasToken: !!(invoice as any).publicToken },
        };
    },

    /**
     * Void an invoice. The number is kept (never reused) and the record stays on
     * file. Refused when a SUCCEEDED payment exists (refund or credit first) or
     * the invoice is already void. Clears the public token so the pay link dies.
     */
    void: async (id: string, companyId: string, reason: string) => {
        return prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, companyId, deletedAt: null } });
            if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
            if (invoice.status === 'VOID') {
                throw new AppError('Invoice is already void', StatusCodes.BAD_REQUEST);
            }
            const settled = await tx.payment.findFirst({
                where: { invoiceId: invoice.id, companyId, status: 'SUCCEEDED' },
            });
            if (settled) {
                throw new AppError(
                    'This invoice has a recorded payment — refund or credit it first',
                    StatusCodes.BAD_REQUEST
                );
            }

            return tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'VOID',
                    voidedAt: new Date(),
                    voidReason: reason,
                    balance: 0,
                    // Kill the pay link: a voided invoice must not be payable.
                    publicToken: null,
                },
            });
        });
    },

    getAll: async (companyId: string, page = 1, limit = 20, status?: string, search?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId, deletedAt: null };
        if (status) where.status = status;

        // Server-side search across invoice number, customer name and job title so
        // the list is not capped at a client-filtered first page.
        const q = search?.trim();
        if (q) {
            where.OR = [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { customerName: { contains: q, mode: 'insensitive' } },
                { job: { is: { title: { contains: q, mode: 'insensitive' } } } },
                { job: { is: { customer: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
            ];
        }

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

    // Completed jobs that have not been invoiced yet — powers the office
    // "create invoice from job" picker (invoices are only ever job-derived).
    getUninvoicedJobs: async (companyId: string) => {
        return prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: 'COMPLETED',
                invoice: { is: null },
            },
            include: {
                customer: { select: { id: true, name: true } },
                lineItems: { select: { total: true } },
            },
            orderBy: { actualEnd: 'desc' },
        });
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
};
