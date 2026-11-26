import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { digitalFormsService } from './digital-forms.service';
import { renderCertificateByToken } from './coc-delivery.service';

const sendPdf = (res: Response, buffer: Buffer, fileName: string) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    // Certificates carry customer details; never let a shared cache keep them.
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(StatusCodes.OK).send(buffer);
};

export const digitalFormsController = {
    createTemplate: async (req: Request, res: Response) => {
        const template = await digitalFormsService.createTemplate(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { template } });
    },

    getTemplates: async (req: Request, res: Response) => {
        const templates = await digitalFormsService.getTemplates(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { templates } });
    },

    updateTemplate: async (req: Request, res: Response) => {
        const template = await digitalFormsService.updateTemplate(
            req.user!.companyId,
            req.params.id,
            req.body
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { template } });
    },

    getLibrary: async (_req: Request, res: Response) => {
        res.status(StatusCodes.OK).json({ status: 'success', data: { library: digitalFormsService.getLibrary() } });
    },

    addFromLibrary: async (req: Request, res: Response) => {
        const template = await digitalFormsService.addFromLibrary(req.user!.companyId, req.params.key);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { template } });
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
        const { templateId, jobId, customerId, take } = req.query;
        const submissions = await digitalFormsService.getSubmissions(req.user!.companyId, {
            templateId: typeof templateId === 'string' ? templateId : undefined,
            jobId: typeof jobId === 'string' ? jobId : undefined,
            customerId: typeof customerId === 'string' ? customerId : undefined,
            take: typeof take === 'string' && /^\d+$/.test(take) ? Number(take) : undefined,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: { submissions } });
    },

    getSubmissionDetails: async (req: Request, res: Response) => {
        const submission = await digitalFormsService.getSubmissionDetails(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { submission } });
    },

    getSubmissionPdf: async (req: Request, res: Response) => {
        const { buffer, fileName } = await digitalFormsService.getSubmissionPdf(
            req.params.id,
            req.user!.companyId,
            req.user!.userId,
            req.user!.role
        );
        sendPdf(res, buffer, fileName);
    },

    sendSubmission: async (req: Request, res: Response) => {
        const result = await digitalFormsService.sendSubmission(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    publicPdf: async (req: Request, res: Response) => {
        const { buffer, fileName } = await renderCertificateByToken(req.params.token);
        sendPdf(res, buffer, fileName);
    },
};
