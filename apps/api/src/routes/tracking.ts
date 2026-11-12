import { Router } from 'express';
import { trackingController } from '../modules/tracking/tracking.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

// Reading colleagues' live GPS + full-day routes is a dispatch view — never TECHNICIAN.
const DISPATCH_VIEW = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

export const trackingRouter = Router();
trackingRouter.use(requireUser);
// A technician's own device still posts its location.
trackingRouter.post('/ping', catchAsync(trackingController.ping));
trackingRouter.get('/latest', restrictTo(...DISPATCH_VIEW), catchAsync(trackingController.latest));
trackingRouter.get('/active-techs', restrictTo(...DISPATCH_VIEW), catchAsync(trackingController.activeTechs));
trackingRouter.get('/playback/:userId', restrictTo(...DISPATCH_VIEW), catchAsync(trackingController.playback));
