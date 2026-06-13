import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { statementsService } from '../modules/statements/statements.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const statementsRouter = Router();
statementsRouter.use(requireUser);

statementsRouter.get('/', catchAsync(async (req: Request, res: Response) => {
    const statements = await statementsService.list(req.user!.companyId, req.query.customerId as string | undefined);
    res.status(StatusCodes.OK).json({ status: 'success', data: { statements } });
}));

statementsRouter.post('/build', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    const { customerId, periodStart, periodEnd } = req.body;
    const result = await statementsService.build(
        req.user!.companyId,
        customerId,
        new Date(periodStart),
        new Date(periodEnd)
    );
    res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
}));

statementsRouter.post('/:id/email', restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'), catchAsync(async (req: Request, res: Response) => {
    await statementsService.email(req.user!.companyId, req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));
