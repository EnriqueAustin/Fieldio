import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { markupRuleService } from './markup-rules.service';

export const markupRuleController = {
    getAll: async (req: Request, res: Response) => {
        const rules = await markupRuleService.getAll(req.user!.companyId);
        res.json({ status: 'success', data: { rules } });
    },

    upsert: async (req: Request, res: Response) => {
        const rule = await markupRuleService.upsert(req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { rule } });
    },

    update: async (req: Request, res: Response) => {
        const rule = await markupRuleService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { rule } });
    },

    delete: async (req: Request, res: Response) => {
        await markupRuleService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    calculateMarkup: async (req: Request, res: Response) => {
        const { category, baseCost } = req.body;
        const result = await markupRuleService.applyMarkup(req.user!.companyId, category, baseCost);
        res.json({ status: 'success', data: result });
    },
};
