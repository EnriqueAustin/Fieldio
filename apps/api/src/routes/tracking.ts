import { Router } from 'express';
import { trackingController } from '../modules/tracking/tracking.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const trackingRouter = Router();
trackingRouter.use(requireUser);
trackingRouter.post('/ping', catchAsync(trackingController.ping));
trackingRouter.get('/latest', catchAsync(trackingController.latest));
