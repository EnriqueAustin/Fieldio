import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { membershipService } from './memberships.service';

export const membershipController = {
    // --- Tiers ---
    getTiers: async (req: Request, res: Response) => {
        const includeInactive = req.query.includeInactive === 'true';
        const tiers = await membershipService.getTiers(req.user!.companyId, includeInactive);
        res.json({ status: 'success', data: { tiers } });
    },

    getTier: async (req: Request, res: Response) => {
        const tier = await membershipService.getTier(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { tier } });
    },

    createTier: async (req: Request, res: Response) => {
        const tier = await membershipService.createTier(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { tier } });
    },

    updateTier: async (req: Request, res: Response) => {
        const tier = await membershipService.updateTier(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { tier } });
    },

    // --- Memberships ---
    getAll: async (req: Request, res: Response) => {
        const status = req.query.status as string | undefined;
        const memberships = await membershipService.getAll(req.user!.companyId, status);
        res.json({ status: 'success', data: { memberships } });
    },

    getOne: async (req: Request, res: Response) => {
        const membership = await membershipService.getOne(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { membership } });
    },

    getByCustomer: async (req: Request, res: Response) => {
        const memberships = await membershipService.getByCustomer(req.params.customerId, req.user!.companyId);
        res.json({ status: 'success', data: { memberships } });
    },

    create: async (req: Request, res: Response) => {
        const membership = await membershipService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { membership } });
    },

    cancel: async (req: Request, res: Response) => {
        const membership = await membershipService.cancel(req.params.id, req.user!.companyId, req.body.reason);
        res.json({ status: 'success', data: { membership } });
    },

    recordVisit: async (req: Request, res: Response) => {
        const membership = await membershipService.recordVisit(req.params.id, req.user!.companyId);
        res.json({ status: 'success', data: { membership } });
    },

    getDiscount: async (req: Request, res: Response) => {
        const discount = await membershipService.getActiveDiscount(req.params.customerId, req.user!.companyId);
        res.json({ status: 'success', data: { discount } });
    },
};
