import { Router, Request, Response } from 'express';
import { vansController } from '../modules/vans/vans.controller';
import { vanServiceService } from '../modules/vans/van-service.service';
import { requireUser, restrictTo } from '../middleware/auth';
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

vanRouter.get('/:id/service-logs', catchAsync(async (req: Request, res: Response) => {
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
