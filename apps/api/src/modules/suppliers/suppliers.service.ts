import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createSupplierSchema = z.object({
    name: z.string().min(1),
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    accountNumber: z.string().optional(),
    notes: z.string().optional(),
});

const updateSupplierSchema = createSupplierSchema.partial().extend({
    active: z.boolean().optional(),
});

export const supplierService = {
    getAll: async (companyId: string, includeInactive = false) => {
        return prisma.supplier.findMany({
            where: { companyId, ...(includeInactive ? {} : { active: true }) },
            orderBy: { name: 'asc' },
            include: { _count: { select: { purchaseOrders: true } } },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const supplier = await prisma.supplier.findFirst({
            where: { id, companyId },
            include: {
                purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });
        if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);
        return supplier;
    },

    create: async (companyId: string, input: z.infer<typeof createSupplierSchema>) => {
        const parsed = createSupplierSchema.parse(input);
        return prisma.supplier.create({
            data: { companyId, ...parsed, email: parsed.email || null },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateSupplierSchema>) => {
        const parsed = updateSupplierSchema.parse(input);
        const supplier = await prisma.supplier.findFirst({ where: { id, companyId } });
        if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);

        return prisma.supplier.update({
            where: { id },
            data: { ...parsed, email: parsed.email !== undefined ? (parsed.email || null) : undefined },
        });
    },
};
