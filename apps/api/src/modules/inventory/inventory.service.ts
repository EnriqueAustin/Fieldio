import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

// The web form posts `minLevel`; older callers post `minQuantity`. Accept both
// and normalise to the column name (`minLevel`).
const createInventorySchema = z
    .object({
        name: z.string().min(2),
        sku: z.string().trim().min(1).optional(),
        quantity: z.number().int().min(0).default(0),
        minLevel: z.number().int().min(0).optional(),
        minQuantity: z.number().int().min(0).optional(),
        unitCost: z.number().optional(),
        location: z.enum(['WAREHOUSE', 'VAN']).optional(),
        vanId: z.string().uuid().optional(),
        defaultSupplierId: z.string().uuid().optional(),
        reorderQty: z.number().int().min(0).optional(),
    })
    .transform(({ minQuantity, minLevel, ...rest }) => ({
        ...rest,
        minLevel: minLevel ?? minQuantity,
    }));

const updateInventorySchema = z
    .object({
        name: z.string().min(2).optional(),
        sku: z.string().trim().min(1).optional(),
        minLevel: z.number().int().min(0).optional(),
        minQuantity: z.number().int().min(0).optional(),
        unitCost: z.number().optional().nullable(),
        defaultSupplierId: z.string().uuid().optional().nullable(),
        reorderQty: z.number().int().min(0).optional(),
    })
    .transform(({ minQuantity, minLevel, ...rest }) => ({
        ...rest,
        ...(minLevel ?? minQuantity) !== undefined ? { minLevel: minLevel ?? minQuantity } : {},
    }));

// A readable fallback SKU from the item name, e.g. "Copper Pipe 1/2\"" → "COPPER-PIPE".
const slugForSku = (name: string) =>
    name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 16) || 'ITEM';

// SKUs are unique per company. For an explicit SKU this throws on collision;
// for an auto-generated one it finds the next free suffix.
async function skuTaken(companyId: string, sku: string, excludeId?: string) {
    const existing = await prisma.inventoryItem.findFirst({ where: { companyId, sku } });
    return !!existing && existing.id !== excludeId;
}

async function nextFreeSku(companyId: string, base: string) {
    let candidate = base;
    let n = 1;
    while (await skuTaken(companyId, candidate)) {
        n += 1;
        candidate = `${base}-${n}`;
    }
    return candidate;
}

export const inventoryService = {
    create: async (companyId: string, rawInput: unknown) => {
        const input = createInventorySchema.parse(rawInput);

        // A supplier set as the reorder default must belong to this company.
        if (input.defaultSupplierId) {
            const supplier = await prisma.supplier.findFirst({
                where: { id: input.defaultSupplierId, companyId },
            });
            if (!supplier) {
                throw new AppError('Supplier not found in this company', StatusCodes.BAD_REQUEST);
            }
        }

        let sku = input.sku;
        if (sku) {
            if (await skuTaken(companyId, sku)) {
                throw new AppError('An item with this SKU already exists', StatusCodes.CONFLICT);
            }
        } else {
            sku = await nextFreeSku(companyId, slugForSku(input.name));
        }

        return prisma.inventoryItem.create({
            data: {
                companyId,
                name: input.name,
                sku,
                quantity: input.quantity,
                ...(input.minLevel !== undefined ? { minLevel: input.minLevel } : {}),
                ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
                ...(input.location !== undefined ? { location: input.location } : {}),
                ...(input.vanId !== undefined ? { vanId: input.vanId } : {}),
                ...(input.defaultSupplierId !== undefined ? { defaultSupplierId: input.defaultSupplierId } : {}),
                ...(input.reorderQty !== undefined ? { reorderQty: input.reorderQty } : {}),
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

        if (data.sku && (await skuTaken(companyId, data.sku, id))) {
            throw new AppError('An item with this SKU already exists', StatusCodes.CONFLICT);
        }

        if (data.defaultSupplierId) {
            const supplier = await prisma.supplier.findFirst({
                where: { id: data.defaultSupplierId, companyId },
            });
            if (!supplier) {
                throw new AppError('Supplier not found in this company', StatusCodes.BAD_REQUEST);
            }
        }

        return prisma.inventoryItem.update({ where: { id }, data });
    },
};
