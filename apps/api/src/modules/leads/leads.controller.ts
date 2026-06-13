import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { leadsService } from './leads.service';

export const leadsController = {
    pipeline: async (req: Request, res: Response) => {
        const data = await leadsService.pipeline(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },
    setStage: async (req: Request, res: Response) => {
        const lead = await leadsService.setStage(req.params.id, req.user!.companyId, req.body.stage, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { lead } });
    },
    sources: async (req: Request, res: Response) => {
        const sources = await leadsService.listSources(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { sources } });
    },
    createSource: async (req: Request, res: Response) => {
        const source = await leadsService.createSource(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { source } });
    },
    deactivateSource: async (req: Request, res: Response) => {
        await leadsService.deactivateSource(req.user!.companyId, req.params.id);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    funnel: async (req: Request, res: Response) => {
        const days = Number(req.query.days) || 90;
        const data = await leadsService.funnel(req.user!.companyId, days);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },
};
