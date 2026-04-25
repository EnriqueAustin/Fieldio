import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createInventorySchema = z.object({
    name: z.string().min(2),
    sku: z.string().optional(),
    quantity: z.number().int(),
    minLevel: z.number().int().optional(),
    location: z.enum(['WAREHOUSE', 'VAN']).optional(),
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

    getAll: async (companyId: string) => {
        return prisma.inventoryItem.findMany({
            where: { companyId },
            orderBy: { name: 'asc' },
        });
    },

    updateQuantity: async (id: string, companyId: string, quantity: number) => {
        const item = await prisma.inventoryItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Item not found', StatusCodes.NOT_FOUND);

        return prisma.inventoryItem.update({
            where: { id },
            data: { quantity },
        });
    }
};
