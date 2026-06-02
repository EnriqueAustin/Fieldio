import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const bundleItemSchema = z.object({
    name: z.string(),
    type: z.enum(['LABOR', 'MATERIAL', 'SERVICE']),
    quantity: z.number().min(0),
    unitCost: z.number().min(0),
});

const createBundleSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    flatPrice: z.number().min(0),
    laborMinutes: z.number().int().min(0).optional(),
    items: z.array(bundleItemSchema),
});

const updateBundleSchema = createBundleSchema.partial().extend({
    active: z.boolean().optional(),
});

export const flatRateService = {
    getAll: async (companyId: string, category?: string, includeInactive = false) => {
        const where: any = { companyId };
        if (!includeInactive) where.active = true;
        if (category) where.category = category;
        return prisma.flatRateBundle.findMany({
            where,
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
    },

    getOne: async (id: string, companyId: string) => {
        const bundle = await prisma.flatRateBundle.findFirst({ where: { id, companyId } });
        if (!bundle) throw new AppError('Flat rate bundle not found', StatusCodes.NOT_FOUND);
        return bundle;
    },

    getCategories: async (companyId: string) => {
        const items = await prisma.flatRateBundle.findMany({
            where: { companyId, active: true, category: { not: null } },
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });
        return items.map((i) => i.category).filter(Boolean);
    },

    create: async (companyId: string, input: z.infer<typeof createBundleSchema>) => {
        const parsed = createBundleSchema.parse(input);
        return prisma.flatRateBundle.create({
            data: { companyId, ...parsed },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateBundleSchema>) => {
        const parsed = updateBundleSchema.parse(input);
        const bundle = await prisma.flatRateBundle.findFirst({ where: { id, companyId } });
        if (!bundle) throw new AppError('Flat rate bundle not found', StatusCodes.NOT_FOUND);
        return prisma.flatRateBundle.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const bundle = await prisma.flatRateBundle.findFirst({ where: { id, companyId } });
        if (!bundle) throw new AppError('Flat rate bundle not found', StatusCodes.NOT_FOUND);
        return prisma.flatRateBundle.update({ where: { id }, data: { active: false } });
    },

    calculateMargin: (bundle: { flatPrice: any; items: any }) => {
        const items = bundle.items as Array<{ unitCost: number; quantity: number }>;
        const totalCost = items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
        const flatPrice = Number(bundle.flatPrice);
        const profit = flatPrice - totalCost;
        const margin = flatPrice > 0 ? Math.round((profit / flatPrice) * 100) : 0;
        return { totalCost, flatPrice, profit, margin };
    },
};
