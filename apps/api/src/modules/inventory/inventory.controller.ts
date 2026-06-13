import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inventoryService } from './inventory.service';
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

export const inventoryController = {
    create: async (req: Request, res: Response) => {
        const data = createInventorySchema.parse(req.body);
        const item = await inventoryService.create(req.user!.companyId, data);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { item } });
    },

    getAll: async (req: Request, res: Response) => {
        const vanId = req.query.vanId as string | undefined;
        const items = await inventoryService.getAll(req.user!.companyId, vanId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { items } });
    },

    update: async (req: Request, res: Response) => {
        // Quantity-only update path (existing tech UX)
        if (typeof req.body?.quantity === 'number' && Object.keys(req.body).length === 1) {
            const { quantity } = updateQuantitySchema.parse(req.body);
            const item = await inventoryService.updateQuantity(
                req.params.id, req.user!.companyId, quantity, req.user!.userId, req.user!.role
            );
            return res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
        }
        // Metadata update (supplier, reorderQty, minLevel, etc.)
        const item = await inventoryService.updateMeta(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    }
};
