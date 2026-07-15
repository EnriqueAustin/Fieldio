import { Router } from 'express';
import { analyticsController } from '../modules/analytics/analytics.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const analyticsRouter = Router();

analyticsRouter.use(requireUser);
analyticsRouter.use(restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'));

analyticsRouter.get('/dashboard', catchAsync(analyticsController.getDashboard));
analyticsRouter.get('/job-costing', catchAsync(analyticsController.getJobCosting));
analyticsRouter.get('/timesheet', catchAsync(analyticsController.getTimesheet));
analyticsRouter.get('/tech-earnings', catchAsync(analyticsController.getTechEarnings));
analyticsRouter.get('/tech-scorecards', catchAsync(analyticsController.getTechScorecards));
analyticsRouter.get('/revenue-by-type', catchAsync(analyticsController.getRevenueByServiceType));
analyticsRouter.get('/estimate-conversion', catchAsync(analyticsController.getEstimateConversion));
analyticsRouter.get('/avg-ticket-trend', catchAsync(analyticsController.getAvgTicketTrend));
analyticsRouter.get('/timeseries', catchAsync(analyticsController.getTimeseries));
analyticsRouter.get('/scoreboard', restrictTo('ADMIN', 'ACCOUNTANT'), catchAsync(analyticsController.getScoreboard));
analyticsRouter.get('/kpi', catchAsync(analyticsController.getKpiSnapshot));
analyticsRouter.get('/kpi/history', catchAsync(analyticsController.getKpiHistory));
