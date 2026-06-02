import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { propertyService } from './properties.service';

export const propertyController = {
    list: async (req: Request, res: Response) => {
        const customerId =
            typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
        const properties = await propertyService.list(req.user!.companyId, customerId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { properties } });
    },

    create: async (req: Request, res: Response) => {
        // Determine customerId from params or body
        const customerId = req.params.customerId || req.body.customerId;
        const property = await propertyService.create(req.user!.companyId, { ...req.body, customerId });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { property } });
    },

    listAssets: async (req: Request, res: Response) => {
        const propertyId =
            typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
        const assets = await propertyService.listAssets(req.user!.companyId, propertyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { assets } });
    },

    createAsset: async (req: Request, res: Response) => {
        const propertyId = req.params.propertyId || req.body.propertyId;
        const asset = await propertyService.createAsset(req.user!.companyId, {
            ...req.body,
            propertyId,
        });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { asset } });
    },

    updateAsset: async (req: Request, res: Response) => {
        const asset = await propertyService.updateAsset(req.params.assetId, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { asset } });
    },

    delete: async (req: Request, res: Response) => {
        await propertyService.delete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
