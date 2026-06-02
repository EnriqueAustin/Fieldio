import { Router } from 'express';
import { timeTrackingController } from '../modules/time-tracking/timeTracking.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const timeTrackingRouter = Router();

timeTrackingRouter.use(requireUser);

timeTrackingRouter.post('/start', catchAsync(timeTrackingController.start));
timeTrackingRouter.post('/:id/stop', catchAsync(timeTrackingController.stop));
timeTrackingRouter.get('/', catchAsync(timeTrackingController.getAll));
timeTrackingRouter.get('/:id', catchAsync(timeTrackingController.getOne));
timeTrackingRouter.patch('/:id', catchAsync(timeTrackingController.update));
timeTrackingRouter.delete('/:id', catchAsync(timeTrackingController.delete));
