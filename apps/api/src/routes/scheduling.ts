import { Router } from 'express';
import { schedulingController } from '../modules/scheduling/scheduling.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const schedulingRouter = Router();

schedulingRouter.use(requireUser);

schedulingRouter.get('/events', catchAsync(schedulingController.getEvents));
schedulingRouter.get('/unscheduled', catchAsync(schedulingController.getUnscheduled));
schedulingRouter.get('/my-week', catchAsync(schedulingController.getMyWeek));
schedulingRouter.post('/jobs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.createJob));
schedulingRouter.patch('/jobs/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.updateEvent));
schedulingRouter.get('/jobs/:id/suggest-techs', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(schedulingController.suggestTechs));
schedulingRouter.post('/jobs/:id/on-my-way', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'TECHNICIAN'), catchAsync(schedulingController.onMyWay));

// Public tracker (no auth)
export const publicTrackerRouter = Router();
publicTrackerRouter.get('/:token', catchAsync(schedulingController.publicTracker));
