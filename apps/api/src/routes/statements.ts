import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { statementsService } from '../modules/statements/statements.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const statementsRouter = Router();
statementsRouter.use(requireUser);

// Statements carry balances: never readable by technicians.
const officeRead = restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT');

statementsRouter.get('/', officeRead, catchAsync(async (req: Request, res: Response) => {
    const statements = await statementsService.list(req.user!.companyId, req.query.customerId as string | undefined);
    res.status(StatusCodes.OK).json({ status: 'success', data: { statements } });
}));

// Month-end worklist: customers with an outstanding balance. Registered before
// the `/:id` param route so it is not captured as a statement id.
statementsRouter.get('/outstanding-customers', officeRead, catchAsync(async (req: Request, res: Response) => {
    const customers = await statementsService.customersWithBalance(req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { customers } });
}));

// Full statement with recomputed line detail, for the printable HTML view.
statementsRouter.get('/:id', officeRead, catchAsync(async (req: Request, res: Response) => {
    const statement = await statementsService.detail(req.user!.companyId, req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success', data: statement });
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
