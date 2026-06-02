import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { permitService } from './permits.service';

export const permitController = {
    getAll: async (req: Request, res: Response) => {
        const jobId = req.query.jobId as string | undefined;
        const permits = await permitService.getAll(req.user!.companyId, jobId);
        res.json({ status: 'success', data: { permits } });
    },

    getOne: async (req: Request, res: Response) => {
        const permit = await permitService.getOne(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { permit } });
    },

    create: async (req: Request, res: Response) => {
        const permit = await permitService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { permit } });
    },

    update: async (req: Request, res: Response) => {
        const permit = await permitService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { permit } });
    },

    delete: async (req: Request, res: Response) => {
        await permitService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    addInspection: async (req: Request, res: Response) => {
        const inspection = await permitService.addInspection(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { inspection } });
    },

    updateInspection: async (req: Request, res: Response) => {
        const inspection = await permitService.updateInspection(req.params.inspectionId, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { inspection } });
    },

    getUpcoming: async (req: Request, res: Response) => {
        const inspections = await permitService.getUpcoming(req.user!.companyId);
        res.json({ status: 'success', data: { inspections } });
    },
};
