import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { jobsService } from './jobs.service';
import { z } from 'zod';

const updateStatusSchema = z.object({
    status: z.enum(['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELED']),
});

const toggleChecklistSchema = z.object({
    isCompleted: z.boolean(),
});

export const jobsController = {
    create: async (req: Request, res: Response) => {
        const job = await jobsService.create(req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { job } });
    },

    quickCreate: async (req: Request, res: Response) => {
        const job = await jobsService.quickCreate(req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { job } });
    },

    update: async (req: Request, res: Response) => {
        const job = await jobsService.update(
            req.params.id, req.user!.companyId, req.user!.userId, req.body
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    getAssignedToMe: async (req: Request, res: Response) => {
        const jobs = await jobsService.getAssignedToTech(req.user!.companyId, req.user!.userId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { jobs } });
    },

    getOne: async (req: Request, res: Response) => {
        const job = await jobsService.getOne(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    getAll: async (req: Request, res: Response) => {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const status = req.query.status as string;
        const branchId = req.query.branchId as string | undefined;
        const result = await jobsService.getAll(req.user!.companyId, page, limit, status, branchId);
        res.status(StatusCodes.OK).json({ status: 'success', data: result });
    },

    updateStatus: async (req: Request, res: Response) => {
        const { status } = updateStatusSchema.parse(req.body);
        const job = await jobsService.updateStatus(
            req.params.id, req.user!.companyId, status, req.user!.userId
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { job } });
    },

    toggleChecklist: async (req: Request, res: Response) => {
        const { isCompleted } = toggleChecklistSchema.parse(req.body);
        const item = await jobsService.toggleChecklist(
            req.params.id, req.params.checkId, req.user!.companyId, isCompleted
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { item } });
    },

    addNote: async (req: Request, res: Response) => {
        const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
        const note = await jobsService.addNote(
            req.params.id, req.user!.companyId, req.user!.userId, message
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { note } });
    },

    addSignature: async (req: Request, res: Response) => {
        const { signerName, signatureDataUrl, signatureUrl } = req.body;
        const signature = await jobsService.addSignature(
            req.params.id, req.user!.companyId, req.user!.userId,
            signerName, signatureDataUrl, signatureUrl
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { signature } });
    },

    addLineItem: async (req: Request, res: Response) => {
        const item = await jobsService.addLineItem(
            req.params.id, req.user!.companyId, req.body, req.user!.userId, req.user!.role
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { item } });
    },

    removeLineItem: async (req: Request, res: Response) => {
        await jobsService.removeLineItem(
            req.params.id, req.params.itemId, req.user!.companyId, req.user!.userId, req.user!.role
        );
        res.status(StatusCodes.OK).json({ status: 'success' });
    },

    addChecklistItem: async (req: Request, res: Response) => {
        const item = await jobsService.addChecklistItem(
            req.params.id, req.user!.companyId, req.body, req.user!.userId, req.user!.role
        );
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { item } });
    },

    removeChecklistItem: async (req: Request, res: Response) => {
        await jobsService.removeChecklistItem(req.params.id, req.params.checkId, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },

    getSiteHistory: async (req: Request, res: Response) => {
        const history = await jobsService.getSiteHistory(
            req.params.id, req.user!.companyId, req.user!.userId, req.user!.role
        );
        res.status(StatusCodes.OK).json({ status: 'success', data: { history } });
    },

    softDelete: async (req: Request, res: Response) => {
        await jobsService.softDelete(req.params.id, req.user!.companyId, req.user!.userId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
