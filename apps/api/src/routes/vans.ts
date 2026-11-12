import { Router, Request, Response } from 'express';
import { vansController } from '../modules/vans/vans.controller';
import { vanServiceService } from '../modules/vans/van-service.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';
import { StatusCodes } from 'http-status-codes';

export const vanRouter = Router();

vanRouter.use(requireUser);

vanRouter.get('/my-van', catchAsync(vansController.getMyVan));
vanRouter.get('/', catchAsync(vansController.getAll));
vanRouter.post('/', restrictTo('ADMIN', 'OFFICE'), catchAsync(vansController.create));
vanRouter.get('/:id', catchAsync(vansController.getOne));
vanRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(vansController.update));
vanRouter.post('/:id/members', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(vansController.addMember));
vanRouter.delete('/:id/members/:userId', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(vansController.removeMember));
vanRouter.get('/:id/inventory', catchAsync(vansController.getVanInventory));
// Restock requests and stepper adjustments are field writes — offline-queued,
// so they carry an Idempotency-Key and must dedupe on replay.
vanRouter.post('/:id/inventory/:itemId/request-restock', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), idempotency, catchAsync(vansController.requestRestock));
vanRouter.post('/:id/inventory/:itemId/adjust', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), idempotency, catchAsync(vansController.adjust));
// Van stock usage is a field write — offline-queued, so it carries an Idempotency-Key.
vanRouter.post('/:id/inventory/:itemId/use', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), idempotency, catchAsync(vansController.useStock));
vanRouter.get('/:id/stock-usage', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(vansController.getStockUsage));

// Service logs carry costs — never exposed to technicians (audit P0 #5).
vanRouter.get('/:id/service-logs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    const logs = await vanServiceService.listLogs(req.params.id, req.user!.companyId);
    res.status(StatusCodes.OK).json({ status: 'success', data: { logs } });
}));
vanRouter.post('/:id/service-logs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(async (req: Request, res: Response) => {
    const log = await vanServiceService.addLog(req.params.id, req.user!.companyId, req.user!.userId, req.body);
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { log } });
}));
vanRouter.post('/service-alerts/run-now', restrictTo('ADMIN'), catchAsync(async (_req: Request, res: Response) => {
    const r = await vanServiceService.runSweep();
    res.status(StatusCodes.OK).json({ status: 'success', data: r });
}));
