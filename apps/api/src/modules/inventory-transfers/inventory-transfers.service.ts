import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createTransferSchema = z.object({
    inventoryItemId: z.string().uuid(),
    fromLocation: z.enum(['WAREHOUSE', 'VAN']),
    toLocation: z.enum(['WAREHOUSE', 'VAN']),
    toVanId: z.string().uuid().optional(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
});

export const inventoryTransfersService = {
    createTransfer: async (companyId: string, userId: string, input: z.infer<typeof createTransferSchema>) => {
        const parsed = createTransferSchema.parse(input);
        
        // Ensure source item has enough quantity
        const sourceItem = await prisma.inventoryItem.findFirst({
            where: { id: parsed.inventoryItemId, companyId, location: parsed.fromLocation }
        });
        
        if (!sourceItem || sourceItem.quantity < parsed.quantity) {
            throw new AppError('Insufficient inventory quantity', StatusCodes.BAD_REQUEST);
        }

        return prisma.inventoryTransfer.create({
            data: {
                companyId,
                inventoryItemId: parsed.inventoryItemId,
                userId,
                fromLocation: parsed.fromLocation,
                toLocation: parsed.toLocation,
                quantity: parsed.quantity,
                notes: parsed.notes,
                status: 'PENDING',
            },
        });
    },

    getTransfers: async (companyId: string, status?: string) => {
        const where: any = { companyId };
        if (status) {
            where.status = status as any;
        }

        return prisma.inventoryTransfer.findMany({
            where,
            include: {
                inventoryItem: { select: { name: true, sku: true } },
                user: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    completeTransfer: async (id: string, companyId: string) => {
        return prisma.$transaction(async (tx) => {
            const transfer = await tx.inventoryTransfer.findFirst({
                where: { id, companyId, status: 'PENDING' },
                include: { inventoryItem: true },
            });

            if (!transfer) {
                throw new AppError('Transfer not found or not pending', StatusCodes.NOT_FOUND);
            }

            const sourceItem = await tx.inventoryItem.findFirst({
                where: { id: transfer.inventoryItemId }
            });
            
            if (!sourceItem || sourceItem.quantity < transfer.quantity) {
                throw new AppError('Insufficient inventory quantity at source', StatusCodes.BAD_REQUEST);
            }

            // Deduct from source
            await tx.inventoryItem.update({
                where: { id: sourceItem.id },
                data: { quantity: sourceItem.quantity - transfer.quantity },
            });

            const toVanId = (transfer as any).toVanId ?? null;

            const destItem = await tx.inventoryItem.findFirst({
                where: {
                    companyId,
                    name: sourceItem.name,
                    sku: sourceItem.sku,
                    location: transfer.toLocation,
                    ...(toVanId ? { vanId: toVanId } : { vanId: null }),
                }
            });

            if (destItem) {
                await tx.inventoryItem.update({
                    where: { id: destItem.id },
                    data: { quantity: destItem.quantity + transfer.quantity },
                });
            } else {
                await tx.inventoryItem.create({
                    data: {
                        companyId,
                        name: sourceItem.name,
                        sku: sourceItem.sku,
                        minLevel: sourceItem.minLevel,
                        unitCost: sourceItem.unitCost,
                        location: transfer.toLocation,
                        vanId: toVanId,
                        quantity: transfer.quantity,
                    }
                });
            }

            return tx.inventoryTransfer.update({
                where: { id },
                data: { status: 'COMPLETED' },
            });
        });
    },
    
    cancelTransfer: async (id: string, companyId: string) => {
        const transfer = await prisma.inventoryTransfer.findFirst({
            where: { id, companyId, status: 'PENDING' }
        });

        if (!transfer) {
            throw new AppError('Transfer not found or not pending', StatusCodes.NOT_FOUND);
        }

        return prisma.inventoryTransfer.update({
            where: { id },
            data: { status: 'CANCELED' },
        });
    }
};
