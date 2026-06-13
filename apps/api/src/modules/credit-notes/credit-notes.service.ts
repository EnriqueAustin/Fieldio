import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';

const nextNumber = async (companyId: string) => {
    const last = await prisma.creditNote.findFirst({
        where: { companyId, number: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { number: true },
    });
    const lastN = last?.number ? parseInt(last.number.replace(/\D/g, ''), 10) : 0;
    const next = (isNaN(lastN) ? 0 : lastN) + 1;
    return `CN-${String(next).padStart(5, '0')}`;
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
            items: Array<{ name: string; quantity: number; unitPrice: number; type?: string }>;
            taxRate?: number;
            taxLabel?: string;
        }
    ) => {
        const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
        const taxRate = input.taxRate ?? 15;
        const tax = (subtotal * taxRate) / 100;
        const total = subtotal + tax;
        const number = await nextNumber(companyId);

        return prisma.creditNote.create({
            data: {
                companyId,
                customerId: input.customerId,
                invoiceId: input.invoiceId,
                number,
                status: 'DRAFT',
                reason: input.reason,
                items: input.items as any,
                subtotal,
                tax,
                total,
                taxLabel: input.taxLabel ?? 'VAT',
                taxRate,
            },
        });
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
