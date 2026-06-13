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

    // --- Authenticated (office staff generates portal link) ---
    generateLink: async (req: Request, res: Response) => {
        const result = await portalService.generatePortalLink(req.params.customerId, req.user!.companyId);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },
};
