import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { warrantyClaimService } from './warranty-claims.service';

export const warrantyClaimController = {
    getAll: async (req: Request, res: Response) => {
        const status = req.query.status as string | undefined;
        const claims = await warrantyClaimService.getAll(req.user!.companyId, status);
        res.json({ status: 'success', data: { claims } });
    },

    getOne: async (req: Request, res: Response) => {
        const claim = await warrantyClaimService.getOne(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { claim } });
    },

    create: async (req: Request, res: Response) => {
        const claim = await warrantyClaimService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { claim } });
    },

    update: async (req: Request, res: Response) => {
        const claim = await warrantyClaimService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { claim } });
    },

    getByAsset: async (req: Request, res: Response) => {
        const claims = await warrantyClaimService.getByAsset(req.params.assetId, req.user!.companyId);
        res.json({ status: 'success', data: { claims } });
    },

    getExpiringWarranties: async (req: Request, res: Response) => {
        const days = Number(req.query.days) || 90;
        const assets = await warrantyClaimService.getExpiringWarranties(req.user!.companyId, days);
        res.json({ status: 'success', data: { assets } });
    },
};
