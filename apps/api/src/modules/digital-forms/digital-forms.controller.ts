import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { digitalFormsService } from './digital-forms.service';

export const digitalFormsController = {
    createTemplate: async (req: Request, res: Response) => {
        const template = await digitalFormsService.createTemplate(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { template } });
    },

    getTemplates: async (req: Request, res: Response) => {
        const templates = await digitalFormsService.getTemplates(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { templates } });
    },

    getJobForms: async (req: Request, res: Response) => {
        const data = await digitalFormsService.getJobForms(
            req.user!.companyId,
            req.user!.userId,
            req.user!.role,
            req.params.jobId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    submitForm: async (req: Request, res: Response) => {
        const submission = await digitalFormsService.submitForm(
            req.user!.companyId,
            req.user!.userId,
            req.body,
            req.user!.role
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { submission } });
    },

    getSubmissions: async (req: Request, res: Response) => {
        const { templateId, jobId, customerId } = req.query;
        const submissions = await digitalFormsService.getSubmissions(req.user!.companyId, {
            templateId: templateId as string,
            jobId: jobId as string,
            customerId: customerId as string,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: { submissions } });
    },

    getSubmissionDetails: async (req: Request, res: Response) => {
        const submission = await digitalFormsService.getSubmissionDetails(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { submission } });
    }
};
