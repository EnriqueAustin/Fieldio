import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { creditNotesService } from '../modules/credit-notes/credit-notes.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const creditNotesRouter = Router();
creditNotesRouter.use(requireUser);

// Credit notes are money documents: never readable by technicians.
const officeRead = restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT');

creditNotesRouter.get('/', officeRead, catchAsync(async (req: Request, res: Response) => {
    const notes = await creditNotesService.list(req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { notes } });
}));

creditNotesRouter.get('/:id', officeRead, catchAsync(async (req: Request, res: Response) => {
    const note = await creditNotesService.get(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { note } });
}));

creditNotesRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    const note = await creditNotesService.create(req.user!.companyId, req.body);
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { note } });
}));

creditNotesRouter.post('/:id/issue', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    const note = await creditNotesService.issue(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { note } });
}));

creditNotesRouter.post('/:id/apply', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    const note = await creditNotesService.apply(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { note } });
}));

creditNotesRouter.post('/:id/void', restrictTo('ADMIN', 'OFFICE'), catchAsync(async (req: Request, res: Response) => {
    await creditNotesService.void(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));
