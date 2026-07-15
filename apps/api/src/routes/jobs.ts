import { Router, Request, Response } from 'express';
import { jobsController } from '../modules/jobs/jobs.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const jobRouter = Router();

jobRouter.use(requireUser);

jobRouter.get('/assigned/me', catchAsync(jobsController.getAssignedToMe));
jobRouter.get('/', catchAsync(jobsController.getAll));
jobRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.create));
jobRouter.post('/quick', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.quickCreate));
jobRouter.get('/:id', catchAsync(jobsController.getOne));
jobRouter.get('/:id/site-history', catchAsync(jobsController.getSiteHistory));
jobRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.update));
jobRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(jobsController.softDelete));
jobRouter.patch('/:id/status', catchAsync(jobsController.updateStatus));
jobRouter.patch('/:id/checklist/:checkId', catchAsync(jobsController.toggleChecklist));
jobRouter.post('/:id/notes', catchAsync(jobsController.addNote));
jobRouter.post('/:id/signatures', catchAsync(jobsController.addSignature));
jobRouter.post('/:id/line-items', catchAsync(jobsController.addLineItem));
jobRouter.delete('/:id/line-items/:itemId', catchAsync(jobsController.removeLineItem));
jobRouter.post('/:id/checklist', catchAsync(jobsController.addChecklistItem));
jobRouter.delete('/:id/checklist/:checkId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.removeChecklistItem));

jobRouter.post('/:id/summary-pdf', catchAsync(async (req: Request, res: Response) => {
    const { jobSummaryService } = await import('../modules/jobs/summary-pdf.service');
    const r = await jobSummaryService.generateAndSend(
        req.params.id,
        req.user!.companyId,
        { email: req.body?.email === true, whatsapp: req.body?.whatsapp === true },
    );
    res.status(200).json({ status: 'success', data: r });
}));
