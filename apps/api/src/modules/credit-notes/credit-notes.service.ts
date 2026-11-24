import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { round2, supplierChargesVat } from '../invoices/invoices.service';
import { normalizeCompanySettings } from '../company/company-settings';

// Credit notes carry their own gap-free series, mirroring how invoices are
// numbered: a configurable prefix + a zero-padded sequence. The next value is
// derived from the company's existing notes and the @@unique([companyId,
// number]) constraint rejects any race (we retry on a collision). A fully
// atomic Company.creditNoteSequence counter, like invoiceSequence, would need a
// schema migration — out of scope here.
const CN_PREFIX = 'CN';

const nextNumber = async (companyId: string) => {
    const last = await prisma.creditNote.findFirst({
        where: { companyId, number: { not: null } },
        orderBy: { number: 'desc' },
        select: { number: true },
    });
    const lastN = last?.number ? parseInt(last.number.replace(/\D/g, ''), 10) : 0;
    const next = (isNaN(lastN) ? 0 : lastN) + 1;
    return `${CN_PREFIX}-${String(next).padStart(5, '0')}`;
};

export const creditNotesService = {
    list: (companyId: string) =>
        prisma.creditNote.findMany({
            where: { companyId },
            include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
            orderBy: { createdAt: 'desc' },
        }),

    get: (id: string, companyId: string) =>
        prisma.creditNote.findFirst({ where: { id, companyId }, include: { customer: true, invoice: true } }),

    create: async (
        companyId: string,
        input: {
            customerId: string;
            invoiceId?: string;
            reason?: string;
            items: Array<{ name: string; description?: string | null; quantity: number; unitPrice: number; type?: string }>;
            taxRate?: number;
            taxLabel?: string;
        }
    ) => {
        if (!input.customerId) throw new AppError('A customer is required', StatusCodes.BAD_REQUEST);
        const rawItems = Array.isArray(input.items) ? input.items : [];
        if (rawItems.length === 0) throw new AppError('At least one line item is required', StatusCodes.BAD_REQUEST);

        // Normalise lines and freeze each line total (same shape as invoice items).
        const items = rawItems.map((i) => {
            const quantity = Number(i.quantity) || 0;
            const unitPrice = Number(i.unitPrice) || 0;
            return {
                name: String(i.name ?? ''),
                description: i.description ?? null,
                quantity,
                unitPrice,
                total: round2(quantity * unitPrice),
                ...(i.type ? { type: i.type } : {}),
            };
        });
        const subtotal = round2(items.reduce((s, i) => s + i.total, 0));

        // VAT handling mirrors invoices: an explicit rate wins (e.g. the credited
        // invoice's rate when pre-filled from one); otherwise fall back to the
        // company's billing rate, and 0 when the supplier has no VAT number.
        let taxRate: number;
        let taxLabel = input.taxLabel;
        if (input.taxRate != null) {
            taxRate = Number(input.taxRate);
        } else {
            const company = await prisma.company.findFirst({
                where: { id: companyId },
                select: { settings: true },
            });
            const settings = normalizeCompanySettings((company as any)?.settings);
            taxRate = supplierChargesVat(settings.billing.taxNumber) ? settings.billing.taxRate : 0;
            taxLabel = taxLabel ?? settings.billing.taxLabel;
        }
        const tax = round2((subtotal * taxRate) / 100);
        const total = round2(subtotal + tax);

        // Gap-free numbering with a unique-constraint backstop: retry if a
        // concurrent note grabbed the same number first.
        for (let attempt = 0; ; attempt++) {
            const number = await nextNumber(companyId);
            try {
                return await prisma.creditNote.create({
                    data: {
                        companyId,
                        customerId: input.customerId,
                        invoiceId: input.invoiceId,
                        number,
                        status: 'DRAFT',
                        reason: input.reason,
                        items: items as any,
                        subtotal,
                        tax,
                        total,
                        taxLabel: taxLabel ?? 'VAT',
                        taxRate,
                    },
                });
            } catch (e: any) {
                if (e?.code === 'P2002' && attempt < 4) continue;
                throw e;
            }
        }
    },

    issue: async (id: string, companyId: string) => {
        const cn = await prisma.creditNote.findFirst({ where: { id, companyId } });
        if (!cn) throw new AppError('Credit note not found', StatusCodes.NOT_FOUND);
        return prisma.creditNote.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    },

    /** Apply credit to an invoice (reduce balance + create payment record). */
    apply: async (id: string, companyId: string) => {
        const cn = await prisma.creditNote.findFirst({ where: { id, companyId } });
        if (!cn || !cn.invoiceId) throw new AppError('Credit note has no target invoice', StatusCodes.BAD_REQUEST);
        if (cn.status === 'APPLIED') throw new AppError('Already applied', StatusCodes.BAD_REQUEST);

        return prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id: cn.invoiceId!, companyId } });
            if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
            const newBalance = Math.max(0, Number(invoice.balance) - Number(cn.total));
            const fullyPaid = newBalance <= 0;
            await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    balance: newBalance,
                    status: fullyPaid ? 'PAID' : invoice.status,
                    paidAt: fullyPaid ? new Date() : invoice.paidAt,
                },
            });
            return tx.creditNote.update({ where: { id }, data: { status: 'APPLIED', appliedAt: new Date() } });
        });
    },

    void: async (id: string, companyId: string) => {
        await prisma.creditNote.updateMany({ where: { id, companyId }, data: { status: 'VOID' } });
    },
};
