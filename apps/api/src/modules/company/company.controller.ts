import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { companyService } from './company.service';
import { storageService, isStorageConfigured } from '../../services/storage.service';
import { AppError } from '../../middleware/error';

export const companyController = {
    getMe: async (req: Request, res: Response) => {
        const company = await companyService.getOne(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { company } });
    },

    updateMe: async (req: Request, res: Response) => {
        const company = await companyService.update(req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { company } });
    },

    getXeroConnections: async (req: Request, res: Response) => {
        const connections = await companyService.getXeroConnections(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { connections } });
    },

    upsertXeroConnection: async (req: Request, res: Response) => {
        const connection = await companyService.upsertXeroConnection(req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { connection } });
    },

    uploadSignature: async (req: Request, res: Response) => {
        if (!isStorageConfigured()) {
            throw new AppError('Storage not configured', StatusCodes.SERVICE_UNAVAILABLE);
        }
        const { dataUrl, entityType, entityId } = req.body;
        if (!dataUrl || !entityType || !entityId) {
            throw new AppError('dataUrl, entityType, and entityId are required', StatusCodes.BAD_REQUEST);
        }
        const result = await storageService.uploadSignature({
            companyId: req.user!.companyId,
            entityType,
            entityId,
            dataUrl,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },
};
