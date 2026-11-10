import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { portalService } from './portal.service';

export const portalController = {
    // --- Public (no auth) ---
    getDashboard: async (req: Request, res: Response) => {
        const data = await portalService.getPortalDashboard(req.params.token);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    getJobDetail: async (req: Request, res: Response) => {
        const job = await portalService.getPortalJobDetail(req.params.token, req.params.jobId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    approveEstimate: async (req: Request, res: Response) => {
        const body = z.object({
            signerName: z.string().min(1).max(200),
            signatureUrl: z.string().min(1).max(5000).refine(
                (url) => url.startsWith('https://') || url.startsWith('data:image/'),
                { message: 'Signature URL must be an HTTPS URL or a data:image URI' }
            ),
        }).parse(req.body);

        const estimate = await portalService.approveEstimateViaPortal(
            req.params.token, req.params.estimateId, body.signerName, body.signatureUrl
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimate } });
    },

    declineEstimate: async (req: Request, res: Response) => {
        const estimate = await portalService.declineEstimateViaPortal(
            req.params.token, req.params.estimateId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { estimate } });
    },

    requestFinancing: async (req: Request, res: Response) => {
        const body = z.object({ financingOptionId: z.string().min(1) }).parse(req.body);
        const application = await portalService.requestFinancing(
            req.params.token, req.params.estimateId, body.financingOptionId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { application } });
    },

    getRescheduleOptions: async (req: Request, res: Response) => {
        const data = await portalService.getRescheduleOptions(req.params.token, req.params.jobId);
        res.status(StatusCodes.OK).json({ status: 'success', data });
    },

    rescheduleJob: async (req: Request, res: Response) => {
        const body = z.object({ start: z.string().datetime() }).parse(req.body);
        const job = await portalService.rescheduleJob(req.params.token, req.params.jobId, new Date(body.start));
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    // --- Authenticated (office staff generates portal link) ---
    generateLink: async (req: Request, res: Response) => {
        const result = await portalService.generatePortalLink(req.params.customerId, req.user!.companyId);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },
};
