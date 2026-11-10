import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inventoryService } from './inventory.service';
import { AppError } from '../../middleware/error';
import { z } from 'zod';

const createInventorySchema = z.object({
    name: z.string().min(2),
    sku: z.string().min(2),
    quantity: z.number().int().min(0),
    minQuantity: z.number().int().min(0),
});

const updateQuantitySchema = z.object({
    quantity: z.number().int().min(0),
});

const OFFICE_EDITORS = ['ADMIN', 'OFFICE'];

// Technicians count stock but must not see what parts cost the company.
function hideCostForTech<T extends { unitCost?: unknown }>(item: T, role?: string) {
    if (role !== 'TECHNICIAN') return item;
    const { unitCost: _unitCost, ...rest } = item;
    return rest;
}

export const inventoryController = {
    create: async (req: Request, res: Response) => {
        const data = createInventorySchema.parse(req.body);
        const item = await inventoryService.create(req.user!.companyId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { item } });
    },

    getAll: async (req: Request, res: Response) => {
        const vanId = req.query.vanId as string | undefined;
        const items = await inventoryService.getAll(req.user!.companyId, vanId);
        const role = req.user!.role;
        res.status(StatusCodes.OK).json({
            status: 'success',
            data: { items: items.map((i) => hideCostForTech(i, role)) },
        });
    },

    update: async (req: Request, res: Response) => {
        // Quantity-only update path (existing tech UX)
        if (typeof req.body?.quantity === 'number' && Object.keys(req.body).length === 1) {
            const { quantity } = updateQuantitySchema.parse(req.body);
            const item = await inventoryService.updateQuantity(
                req.params.id, req.user!.companyId, quantity, req.user!.userId, req.user!.role
            );
            return res.status(StatusCodes.OK).json({
                status: 'success',
                data: { item: hideCostForTech(item, req.user!.role) },
            });
        }
        // Metadata update (cost, supplier, reorderQty, minLevel, etc.) is office-only.
        if (!OFFICE_EDITORS.includes(req.user!.role)) {
            throw new AppError('You do not have permission to perform this action', StatusCodes.FORBIDDEN);
        }
        const item = await inventoryService.updateMeta(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    }
};
