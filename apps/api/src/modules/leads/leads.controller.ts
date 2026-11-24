import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { leadsService } from './leads.service';

export const leadsController = {
    pipeline: async (req: Request, res: Response) => {
        const data = await leadsService.pipeline(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },
    get: async (req: Request, res: Response) => {
        const lead = await leadsService.get(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { lead } });
    },
    create: async (req: Request, res: Response) => {
        const lead = await leadsService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { lead } });
    },
    update: async (req: Request, res: Response) => {
        const lead = await leadsService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { lead } });
    },
    listNotes: async (req: Request, res: Response) => {
        const notes = await leadsService.listNotes(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { notes } });
    },
    addNote: async (req: Request, res: Response) => {
        const note = await leadsService.addNote(req.params.id, req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { note } });
    },
    convert: async (req: Request, res: Response) => {
        const data = await leadsService.convert(req.params.id, req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data });
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
    updateSource: async (req: Request, res: Response) => {
        const source = await leadsService.updateSource(req.user!.companyId, req.params.id, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { source } });
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
