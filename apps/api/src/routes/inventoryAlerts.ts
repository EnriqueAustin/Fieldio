import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inventoryAlertsService } from '../modules/inventory-alerts/inventory-alerts.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const inventoryAlertsRouter = Router();
inventoryAlertsRouter.use(requireUser);

inventoryAlertsRouter.get('/targets', catchAsync(async (req: Request, res: Response) => {
    const targets = await inventoryAlertsService.listTargets(req.user!.companyId, req.query.vanId as string | undefined);
    res.status(StatusCodes.OK).json({ status: 'success', data: { targets } });
}));

inventoryAlertsRouter.post('/targets', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    const target = await inventoryAlertsService.setTarget(req.user!.companyId, req.body);
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { target } });
}));

inventoryAlertsRouter.delete('/targets/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(async (req: Request, res: Response) => {
    await inventoryAlertsService.removeTarget(req.user!.companyId, req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));

inventoryAlertsRouter.get('/', catchAsync(async (req: Request, res: Response) => {
    const alerts = await inventoryAlertsService.listAlerts(req.user!.companyId, (req.query.status as any) || 'OPEN');
    res.status(StatusCodes.OK).json({ status: 'success', data: { alerts } });
}));

inventoryAlertsRouter.post('/:id/acknowledge', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    await inventoryAlertsService.acknowledge(req.user!.companyId, req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));

inventoryAlertsRouter.post('/:id/resolve', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    await inventoryAlertsService.resolve(req.user!.companyId, req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success' });
}));

inventoryAlertsRouter.post('/run-now', restrictTo('ADMIN'), catchAsync(async (_req: Request, res: Response) => {
    const r = await inventoryAlertsService.runSweep();
    res.status(StatusCodes.OK).json({ status: 'success', data: r });
}));

inventoryAlertsRouter.post('/create-po', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(async (req: Request, res: Response) => {
    const alertIds = Array.isArray(req.body?.alertIds) ? req.body.alertIds : [];
    const r = await inventoryAlertsService.createPOFromAlerts(req.user!.companyId, req.user!.userId, alertIds);
    res.status(StatusCodes.CREATED).json({ status: 'success', data: r });
}));
