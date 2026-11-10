import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { priceBookService, ListOptions } from './price-book.service';

export const priceBookController = {
    getAll: async (req: Request, res: Response) => {
        const opts: ListOptions = {
            search: req.query.search as string | undefined,
            category: req.query.category as string | undefined,
            type: req.query.type as string | undefined,
            includeInactive: req.query.includeInactive === 'true',
            page: req.query.page ? Number(req.query.page) : undefined,
            pageSize: req.query.limit ? Number(req.query.limit) : undefined,
        };
        const data = await priceBookService.getAll(req.user!.companyId, opts, req.user!.role);
        res.status(StatusCodes.OK).json({ status: 'success', data });
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

    archive: async (req: Request, res: Response) => {
        const item = await priceBookService.archive(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    },

    bulkImport: async (req: Request, res: Response) => {
        const result = await priceBookService.bulkImport(req.user!.companyId, req.body.rows ?? req.body.items);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },
};
