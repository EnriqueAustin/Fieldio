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
        const items = await inventoryService.getAll(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { items } });
    },

    update: async (req: Request, res: Response) => {
        const { quantity } = updateQuantitySchema.parse(req.body);
        const item = await inventoryService.updateQuantity(req.params.id, req.user!.companyId, quantity);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    }
};
