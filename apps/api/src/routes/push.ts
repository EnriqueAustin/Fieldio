import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { pushService } from '../modules/push/push.service';

// Web Push device registration. Any signed-in user may register this browser
// for themselves. Status/delete act on the browser's own endpoint (a secret
// capability URL), so a new login can clear a previous user's subscription.
export const pushRouter = Router();
pushRouter.use(requireUser);

pushRouter.get('/public-key', (_req: Request, res: Response) => {
    const publicKey = pushService.getPublicKey();
    res.status(StatusCodes.OK).json({ status: 'success', data: { enabled: publicKey !== null, publicKey } });
});

pushRouter.post('/subscriptions', catchAsync(async (req: Request, res: Response) => {
    const subscription = await pushService.subscribe(req.user!, req.body, req.get('user-agent'));
    res.status(StatusCodes.CREATED).json({ status: 'success', data: { subscription } });
}));

// POST (not GET) so the endpoint, a capability URL, never lands in a query string or access log.
pushRouter.post('/subscriptions/status', catchAsync(async (req: Request, res: Response) => {
    const status = await pushService.status(req.user!, req.body);
    res.status(StatusCodes.OK).json({ status: 'success', data: status });
}));

pushRouter.delete('/subscriptions',catchAsync(async (req: Request, res: Response) => {
    const result = await pushService.unsubscribe(req.user!, req.body);
    res.status(StatusCodes.OK).json({ status: 'success', data: result });
}));
