import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { jobTemplatesService, createTemplateSchema } from './job-templates.service';

export const jobTemplatesController = {
    list: async (req: Request, res: Response) => {
        const templates = await jobTemplatesService.list(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { templates } });
    },
    get: async (req: Request, res: Response) => {
        const template = await jobTemplatesService.get(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { template } });
    },
    create: async (req: Request, res: Response) => {
        const parsed = createTemplateSchema.parse(req.body);
        const template = await jobTemplatesService.create(req.user!.companyId, parsed);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { template } });
    },
    update: async (req: Request, res: Response) => {
        const template = await jobTemplatesService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { template } });
    },
    deactivate: async (req: Request, res: Response) => {
        await jobTemplatesService.deactivate(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    apply: async (req: Request, res: Response) => {
        const job = await jobTemplatesService.applyToNewJob(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { job } });
    },
};
