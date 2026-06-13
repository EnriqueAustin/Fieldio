import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    unitPrice: z.number().min(0),
    type: z.enum(['SERVICE', 'MATERIAL', 'LABOR']).default('SERVICE'),
    category: z.string().optional(),
    sku: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial().extend({
    active: z.boolean().optional(),
});

/**
 * Technicians work the field and select items by name/SKU only — they must not
 * see what the company charges. Strip pricing before it ever leaves the API so
 * it can't be read from the network response or client memory either.
 */
function hidePricesForTech<T extends { unitPrice?: unknown }>(items: T[], role?: string) {
    if (role !== 'TECHNICIAN') return items;
    return items.map(({ unitPrice, ...rest }) => rest);
}

export const priceBookService = {
    getAll: async (companyId: string, includeInactive = false, category?: string, role?: string) => {
        const where: any = { companyId };
        if (!includeInactive) where.active = true;
        if (category) where.category = category;

        const items = await prisma.priceBookItem.findMany({
            where,
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
        return hidePricesForTech(items, role);
    },

    getCategories: async (companyId: string) => {
        const items = await prisma.priceBookItem.findMany({
            where: { companyId, active: true, category: { not: null } },
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });
        return items.map((i) => i.category).filter(Boolean);
    },

    getOne: async (id: string, companyId: string, role?: string) => {
        const item = await prisma.priceBookItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Price book item not found', StatusCodes.NOT_FOUND);
        return hidePricesForTech([item], role)[0];
    },

    create: async (companyId: string, input: z.infer<typeof createItemSchema>) => {
        const parsed = createItemSchema.parse(input);
        return prisma.priceBookItem.create({
            data: { companyId, ...parsed },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateItemSchema>) => {
        const parsed = updateItemSchema.parse(input);
        const item = await prisma.priceBookItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Price book item not found', StatusCodes.NOT_FOUND);

        return prisma.priceBookItem.update({
            where: { id },
            data: parsed,
        });
    },

    bulkCreate: async (companyId: string, items: z.infer<typeof createItemSchema>[]) => {
        const parsed = items.map((i) => createItemSchema.parse(i));
        return prisma.priceBookItem.createMany({
            data: parsed.map((item) => ({ companyId, ...item })),
        });
    },
};
