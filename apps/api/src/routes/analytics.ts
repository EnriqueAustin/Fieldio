import { Router } from 'express';
import { analyticsController } from '../modules/analytics/analytics.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const analyticsRouter = Router();

analyticsRouter.use(requireUser);

analyticsRouter.get('/dashboard', catchAsync(analyticsController.getDashboard));
analyticsRouter.get('/job-costing', catchAsync(analyticsController.getJobCosting));
analyticsRouter.get('/timesheet', catchAsync(analyticsController.getTimesheet));
analyticsRouter.get('/tech-earnings', catchAsync(analyticsController.getTechEarnings));
