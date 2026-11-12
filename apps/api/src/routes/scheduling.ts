import { Router } from 'express';
import { schedulingController } from '../modules/scheduling/scheduling.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { idempotency } from '../middleware/idempotency';

export const schedulingRouter = Router();

schedulingRouter.use(requireUser);

// The full dispatch board (every job across all crews) is office/dispatch only.
// /my-week and /my-route stay open — they scope to the caller's own jobs.
const DISPATCH_BOARD = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;

schedulingRouter.get('/events', restrictTo(...DISPATCH_BOARD), catchAsync(schedulingController.getEvents));
schedulingRouter.get('/unscheduled', restrictTo(...DISPATCH_BOARD), catchAsync(schedulingController.getUnscheduled));
schedulingRouter.get('/my-week', catchAsync(schedulingController.getMyWeek));
schedulingRouter.get('/my-route', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(schedulingController.getDayRoute));
schedulingRouter.post('/jobs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.createJob));
schedulingRouter.patch('/jobs/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.updateEvent));
schedulingRouter.get('/jobs/:id/suggest-techs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.suggestTechs));
schedulingRouter.post('/jobs/:id/on-my-way', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), idempotency, catchAsync(schedulingController.onMyWay));

// Public tracker (no auth)
export const publicTrackerRouter = Router();
publicTrackerRouter.get('/:token', catchAsync(schedulingController.publicTracker));
