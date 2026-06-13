import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { dunningService } from './dunning.service';

export const dunningController = {
    listRules: async (req: Request, res: Response) => {
        const rules = await dunningService.listRules(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { rules } });
    },
    createRule: async (req: Request, res: Response) => {
        const rule = await dunningService.createRule(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { rule } });
    },
    updateRule: async (req: Request, res: Response) => {
        await dunningService.updateRule(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    deleteRule: async (req: Request, res: Response) => {
        await dunningService.deleteRule(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    seedDefaults: async (req: Request, res: Response) => {
        await dunningService.seedDefaults(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    runNow: async (_req: Request, res: Response) => {
        const result = await dunningService.runSweep();
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },
};
