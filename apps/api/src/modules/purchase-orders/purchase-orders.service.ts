import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { normalizeCompanySettings } from '../company/company-settings';

const poLineItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
});

const createPOSchema = z.object({
    supplierId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    items: z.array(poLineItemSchema).min(1),
    notes: z.string().optional(),
    expectedDate: z.string().datetime().optional(),
});

const updatePOSchema = z.object({
    status: z.enum(['DRAFT', 'SENT', 'RECEIVED', 'PARTIAL', 'CANCELED']).optional(),
    notes: z.string().optional(),
    expectedDate: z.string().datetime().nullable().optional(),
    items: z.array(poLineItemSchema).min(1).optional(),
});

export const purchaseOrderService = {
    getAll: async (companyId: string, page = 1, limit = 20, supplierId?: string, jobId?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId };
        if (supplierId) where.supplierId = supplierId;
        if (jobId) where.jobId = jobId;

        const [items, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    supplier: { select: { name: true } },
                    job: { select: { id: true, title: true } },
                },
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    getOne: async (id: string, companyId: string) => {
        const po = await prisma.purchaseOrder.findFirst({
            where: { id, companyId },
            include: {
                supplier: true,
                job: { select: { id: true, title: true, customer: { select: { name: true } } } },
            },
        });
        if (!po) throw new AppError('Purchase order not found', StatusCodes.NOT_FOUND);
        return po;
    },

    create: async (companyId: string, userId: string, input: z.infer<typeof createPOSchema>) => {
        const parsed = createPOSchema.parse(input);

        const supplier = await prisma.supplier.findFirst({
            where: { id: parsed.supplierId, companyId, active: true },
        });
        if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);

        if (parsed.jobId) {
            const job = await prisma.job.findFirst({ where: { id: parsed.jobId, companyId, deletedAt: null } });
            if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        }

        const company = await prisma.company.findUnique({ where: { id: companyId } });
        const settings = normalizeCompanySettings(company?.settings);
        const taxRate = settings.billing.taxRate / 100;

        const subtotal = parsed.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const poCount = await prisma.purchaseOrder.count({ where: { companyId } });
        const orderNumber = `PO-${String(poCount + 1).padStart(5, '0')}`;

        const po = await prisma.purchaseOrder.create({
            data: {
                companyId,
                supplierId: parsed.supplierId,
                jobId: parsed.jobId,
                orderNumber,
                items: parsed.items as any,
                subtotal,
                tax,
                total,
                notes: parsed.notes,
                expectedDate: parsed.expectedDate ? new Date(parsed.expectedDate) : null,
            },
            include: { supplier: { select: { name: true } } },
        });

        await prisma.auditLog.create({
            data: {
                companyId,
                userId,
                action: 'PO_CREATED',
                entityId: po.id,
                entityType: 'PURCHASE_ORDER',
                metadata: { orderNumber, supplierId: parsed.supplierId },
            },
        });

        return po;
    },

    update: async (id: string, companyId: string, userId: string, input: z.infer<typeof updatePOSchema>) => {
        const parsed = updatePOSchema.parse(input);
        const po = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
        if (!po) throw new AppError('Purchase order not found', StatusCodes.NOT_FOUND);

        let subtotal = Number(po.subtotal);
        let tax = Number(po.tax);
        let total = Number(po.total);

        if (parsed.items) {
            const company = await prisma.company.findUnique({ where: { id: companyId } });
            const settings = normalizeCompanySettings(company?.settings);
            const taxRate = settings.billing.taxRate / 100;
            subtotal = parsed.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
            tax = subtotal * taxRate;
            total = subtotal + tax;
        }

        const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: {
                ...(parsed.status ? { status: parsed.status } : {}),
                ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
                ...(parsed.expectedDate !== undefined
                    ? { expectedDate: parsed.expectedDate ? new Date(parsed.expectedDate) : null }
                    : {}),
                ...(parsed.items ? { items: parsed.items as any, subtotal, tax, total } : {}),
                ...(parsed.status === 'RECEIVED' ? { receivedAt: new Date() } : {}),
            },
            include: { supplier: { select: { name: true } } },
        });

        await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: 'PO_UPDATED',
                entityId: id,
                entityType: 'PURCHASE_ORDER',
                metadata: { status: parsed.status },
            },
        });

        return updated;
    },
};
