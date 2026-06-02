import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { flatRateService } from './flat-rate.service';

export const flatRateController = {
    getAll: async (req: Request, res: Response) => {
        const category = req.query.category as string | undefined;
        const includeInactive = req.query.includeInactive === 'true';
        const bundles = await flatRateService.getAll(req.user!.companyId, category, includeInactive);
        res.json({ status: 'success', data: { bundles } });
    },

    getOne: async (req: Request, res: Response) => {
        const bundle = await flatRateService.getOne(req.params.id, req.user!.companyId);
        const margins = flatRateService.calculateMargin(bundle);
        res.json({ status: 'success', data: { bundle, margins } });
    },

    getCategories: async (req: Request, res: Response) => {
        const categories = await flatRateService.getCategories(req.user!.companyId);
        res.json({ status: 'success', data: { categories } });
    },

    create: async (req: Request, res: Response) => {
        const bundle = await flatRateService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { bundle } });
    },

    update: async (req: Request, res: Response) => {
        const bundle = await flatRateService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { bundle } });
    },

    delete: async (req: Request, res: Response) => {
        await flatRateService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },
};
