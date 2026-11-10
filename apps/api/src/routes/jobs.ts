import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';
import { jobsController } from '../modules/jobs/jobs.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { AppError } from '../middleware/error';
import { catchAsync } from '../utils/catchAsync';

export const jobRouter = Router();

jobRouter.use(requireUser);

jobRouter.get('/assigned/me', catchAsync(jobsController.getAssignedToMe));
// The company-wide job list (with line-item prices) is an office view; technicians
// use /assigned/me.
jobRouter.get('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'), catchAsync(jobsController.getAll));
jobRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.create));
jobRouter.post('/quick', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.quickCreate));
jobRouter.get('/:id', catchAsync(jobsController.getOne));
jobRouter.get('/:id/site-history', catchAsync(jobsController.getSiteHistory));
jobRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.update));
jobRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(jobsController.softDelete));
// Field writes carry an Idempotency-Key so a replayed offline action runs once.
jobRouter.patch('/:id/status', idempotency, catchAsync(jobsController.updateStatus));
jobRouter.patch('/:id/checklist/:checkId', idempotency, catchAsync(jobsController.toggleChecklist));
jobRouter.post('/:id/notes', idempotency, catchAsync(jobsController.addNote));
jobRouter.post('/:id/signatures', idempotency, catchAsync(jobsController.addSignature));
jobRouter.post('/:id/line-items', idempotency, catchAsync(jobsController.addLineItem));
jobRouter.delete('/:id/line-items/:itemId', idempotency, catchAsync(jobsController.removeLineItem));
jobRouter.post('/:id/checklist', idempotency, catchAsync(jobsController.addChecklistItem));
jobRouter.delete('/:id/checklist/:checkId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(jobsController.removeChecklistItem));

// The summary PDF carries unit prices. A technician may trigger the customer send
// for their own (or their van's) job, but never gets the PDF link back.
jobRouter.post('/:id/summary-pdf', catchAsync(async (req: Request, res: Response) => {
    const isTech = req.user!.role === 'TECHNICIAN';
    if (isTech) {
        const job = await prisma.job.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, deletedAt: null },
            select: { techId: true, vanId: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        let allowed = job.techId === req.user!.userId;
        if (!allowed && job.vanId) {
            const membership = await prisma.vanMember.findFirst({
                where: { userId: req.user!.userId, van: { id: job.vanId, companyId: req.user!.companyId } },
            });
            allowed = !!membership;
        }
        if (!allowed) {
            throw new AppError('You can only send summaries for jobs assigned to you or your van', StatusCodes.FORBIDDEN);
        }
    }

    // Techs can only send to the customer, not generate a download-only copy.
    const email = isTech ? true : req.body?.email === true;
    const whatsapp = isTech ? true : req.body?.whatsapp === true;

    const { jobSummaryService } = await import('../modules/jobs/summary-pdf.service');
    const r = await jobSummaryService.generateAndSend(req.params.id, req.user!.companyId, { email, whatsapp });

    if (isTech) {
        res.status(200).json({ status: 'success', data: { sent: true } });
        return;
    }
    res.status(200).json({ status: 'success', data: r });
}));
