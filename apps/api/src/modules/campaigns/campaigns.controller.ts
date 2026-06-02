import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { campaignService } from './campaigns.service';

export const campaignController = {
    getAll: async (req: Request, res: Response) => {
        const campaigns = await campaignService.getAll(req.user!.companyId);
        res.json({ status: 'success', data: { campaigns } });
    },

    getOne: async (req: Request, res: Response) => {
        const campaign = await campaignService.getOne(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { campaign } });
    },

    create: async (req: Request, res: Response) => {
        const campaign = await campaignService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { campaign } });
    },

    update: async (req: Request, res: Response) => {
        const campaign = await campaignService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { campaign } });
    },

    delete: async (req: Request, res: Response) => {
        await campaignService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    getStats: async (req: Request, res: Response) => {
        const stats = await campaignService.getStats(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { stats } });
    },
};
