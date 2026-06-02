import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { financingService } from './financing.service';

export const financingController = {
    // --- Options ---
    getOptions: async (req: Request, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const options = await financingService.getOptions(req.user!.companyId, includeInactive);
        res.json({ status: 'success', data: { options } });
    },

    createOption: async (req: Request, res: Response) => {
        const option = await financingService.createOption(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { option } });
    },

    updateOption: async (req: Request, res: Response) => {
        const option = await financingService.updateOption(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { option } });
    },

    // --- Applications ---
    getApplications: async (req: Request, res: Response) => {
        const { status, customerId } = req.query as Record<string, string>;
        const apps = await financingService.getApplications(req.user!.companyId, status, customerId);
        res.json({ status: 'success', data: { applications: apps } });
    },

    getApplication: async (req: Request, res: Response) => {
        const app = await financingService.getApplication(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { application: app } });
    },

    createApplication: async (req: Request, res: Response) => {
        const app = await financingService.createApplication(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { application: app } });
    },

    updateApplication: async (req: Request, res: Response) => {
        const app = await financingService.updateApplication(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { application: app } });
    },

    getByEstimate: async (req: Request, res: Response) => {
        const apps = await financingService.getByEstimate(req.params.estimateId, req.user!.companyId);
        res.json({ status: 'success', data: { applications: apps } });
    },
};
