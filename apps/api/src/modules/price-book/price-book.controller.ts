import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { priceBookService } from './price-book.service';

export const priceBookController = {
    getAll: async (req: Request, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const category = req.query.category as string | undefined;
        const items = await priceBookService.getAll(req.user!.companyId, includeInactive, category, req.user!.role);
        res.status(StatusCodes.OK).json({ status: 'success', data: { items } });
    },

    getCategories: async (req: Request, res: Response) => {
        const categories = await priceBookService.getCategories(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { categories } });
    },

    getOne: async (req: Request, res: Response) => {
        const item = await priceBookService.getOne(req.params.id, req.user!.companyId, req.user!.role);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    },

    create: async (req: Request, res: Response) => {
        const item = await priceBookService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { item } });
    },

    update: async (req: Request, res: Response) => {
        const item = await priceBookService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    },

    bulkCreate: async (req: Request, res: Response) => {
        const result = await priceBookService.bulkCreate(req.user!.companyId, req.body.items);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { count: result.count } });
    },
};
