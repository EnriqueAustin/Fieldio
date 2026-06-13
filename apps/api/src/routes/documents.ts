import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { documentsService } from '../modules/documents/documents.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const documentsRouter = Router();
documentsRouter.use(requireUser);

documentsRouter.get('/', catchAsync(async (req: Request, res: Response) => {
    const entityType = req.query.entityType as any;
    const entityId = req.query.entityId as string;
    if (!entityType || !entityId) {
        res.status(StatusCodes.BAD_REQUEST).json({ status: 'error', message: 'entityType and entityId required' });
        return;
    }
    const documents = await documentsService.list(req.user!.companyId, entityType, entityId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { documents } });
}));

documentsRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    const doc = await documentsService.create(req.user!.companyId, req.user!.userId, req.body);
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { document: doc } });
}));

documentsRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(async (req: Request, res: Response) => {
    await documentsService.delete(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));
