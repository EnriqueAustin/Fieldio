import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { subcontractorService } from './subcontractors.service';

export const subcontractorController = {
    getAll: async (req: Request, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const subs = await subcontractorService.getAll(req.user!.companyId, includeInactive);
        res.json({ status: 'success', data: { subcontractors: subs } });
    },

    getOne: async (req: Request, res: Response) => {
        const sub = await subcontractorService.getOne(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { subcontractor: sub } });
    },

    create: async (req: Request, res: Response) => {
        const sub = await subcontractorService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { subcontractor: sub } });
    },

    update: async (req: Request, res: Response) => {
        const sub = await subcontractorService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { subcontractor: sub } });
    },

    delete: async (req: Request, res: Response) => {
        await subcontractorService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    getExpiringDocs: async (req: Request, res: Response) => {
        const subs = await subcontractorService.getExpiringDocuments(req.user!.companyId);
        res.json({ status: 'success', data: { subcontractors: subs } });
    },

    createAssignment: async (req: Request, res: Response) => {
        const assignment = await subcontractorService.createAssignment(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { assignment } });
    },

    updateAssignment: async (req: Request, res: Response) => {
        const assignment = await subcontractorService.updateAssignment(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { assignment } });
    },

    getAssignmentsByJob: async (req: Request, res: Response) => {
        const assignments = await subcontractorService.getAssignmentsByJob(req.params.jobId, req.user!.companyId);
        res.json({ status: 'success', data: { assignments } });
    },

    getPayoutSummary: async (req: Request, res: Response) => {
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;
        const summary = await subcontractorService.getPayoutSummary(req.user!.companyId, from, to);
        res.json({ status: 'success', data: { summary } });
    },
};
