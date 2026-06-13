import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createInventorySchema = z.object({
    name: z.string().min(2),
    sku: z.string().optional(),
    quantity: z.number().int(),
    minLevel: z.number().int().optional(),
    unitCost: z.number().optional(),
    location: z.enum(['WAREHOUSE', 'VAN']).optional(),
    vanId: z.string().uuid().optional(),
    defaultSupplierId: z.string().uuid().optional(),
    reorderQty: z.number().int().optional(),
});

const updateInventorySchema = z.object({
    name: z.string().min(2).optional(),
    sku: z.string().optional(),
    minLevel: z.number().int().optional(),
    unitCost: z.number().optional(),
    defaultSupplierId: z.string().uuid().optional().nullable(),
    reorderQty: z.number().int().optional(),
});

export const inventoryService = {
    create: async (companyId: string, input: z.infer<typeof createInventorySchema>) => {
        return prisma.inventoryItem.create({
            data: {
                companyId,
                ...input,
            },
        });
    },

    getAll: async (companyId: string, vanId?: string) => {
        const where: any = { companyId };
        if (vanId) where.vanId = vanId;

        return prisma.inventoryItem.findMany({
            where,
            include: {
                van: { select: { id: true, name: true } },
            },
            orderBy: { name: 'asc' },
        });
    },

    updateQuantity: async (id: string, companyId: string, quantity: number, userId?: string, userRole?: string) => {
        const item = await prisma.inventoryItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Item not found', StatusCodes.NOT_FOUND);

        if (userRole === 'TECHNICIAN') {
            if (item.location === 'WAREHOUSE') {
                throw new AppError('Technicians cannot adjust warehouse stock', StatusCodes.FORBIDDEN);
            }
            if (item.assignedUserId && item.assignedUserId !== userId) {
                throw new AppError('You can only adjust stock assigned to you', StatusCodes.FORBIDDEN);
            }
            if (item.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId: userId!, van: { id: item.vanId, companyId } },
                });
                if (!membership) {
                    throw new AppError('You can only adjust stock on your van', StatusCodes.FORBIDDEN);
                }
            }
        }

        return prisma.inventoryItem.update({
            where: { id },
            data: { quantity },
        });
    },

    updateMeta: async (id: string, companyId: string, input: unknown) => {
        const item = await prisma.inventoryItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Item not found', StatusCodes.NOT_FOUND);
        const data = updateInventorySchema.parse(input);
        return prisma.inventoryItem.update({ where: { id }, data });
    },
};
