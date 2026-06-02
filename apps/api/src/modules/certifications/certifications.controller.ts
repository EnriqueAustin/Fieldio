import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { certificationService } from './certifications.service';

export const certificationController = {
    getAll: async (req: Request, res: Response) => {
        const certs = await certificationService.getAll(req.user!.companyId);
        res.json({ status: 'success', data: { certifications: certs } });
    },

    getByUser: async (req: Request, res: Response) => {
        const certs = await certificationService.getByUser(req.params.userId, req.user!.companyId);
        res.json({ status: 'success', data: { certifications: certs } });
    },

    create: async (req: Request, res: Response) => {
        const cert = await certificationService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { certification: cert } });
    },

    update: async (req: Request, res: Response) => {
        const cert = await certificationService.update(req.params.id, req.user!.companyId, req.body);
        res.json({ status: 'success', data: { certification: cert } });
    },

    delete: async (req: Request, res: Response) => {
        await certificationService.delete(req.params.id, req.user!.companyId);
        res.json({ status: 'success' });
    },

    getExpiring: async (req: Request, res: Response) => {
        const days = Number(req.query.days) || 30;
        const certs = await certificationService.getExpiring(req.user!.companyId, days);
        res.json({ status: 'success', data: { certifications: certs } });
    },
};
