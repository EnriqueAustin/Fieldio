import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { vansService } from './vans.service';

export const vansController = {
    create: async (req: Request, res: Response) => {
        const van = await vansService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { van } });
    },

    getAll: async (req: Request, res: Response) => {
        const vans = await vansService.getAll(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { vans } });
    },

    getOne: async (req: Request, res: Response) => {
        const van = await vansService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { van } });
    },

    update: async (req: Request, res: Response) => {
        const van = await vansService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { van } });
    },

    addMember: async (req: Request, res: Response) => {
        const member = await vansService.addMember(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { member } });
    },

    removeMember: async (req: Request, res: Response) => {
        await vansService.removeMember(req.params.id, req.params.userId, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },

    getMyVan: async (req: Request, res: Response) => {
        const van = await vansService.getVanForUser(req.user!.userId, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { van } });
    },

    getVanInventory: async (req: Request, res: Response) => {
        const items = await vansService.getVanInventory(req.params.id, req.user!.companyId, req.user!.role);
        res.status(StatusCodes.OK).json({ status: 'success', data: { items } });
    },
};
