import { Router } from 'express';
import { timeTrackingController } from '../modules/time-tracking/timeTracking.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const timeTrackingRouter = Router();

timeTrackingRouter.use(requireUser);

/**
 * Technicians do not log their own hours — job status does. Arriving on site
 * starts the clock, completing the job stops it (see jobsService.updateStatus).
 *
 * So the write half of this module is an office correction tool, closed to the
 * field. Technicians keep read access to their own timesheet and summary.
 */
// Correcting payroll (edit / manual add / delete) is the tightest ring.
const correctionOnly = restrictTo('ADMIN', 'OFFICE');
// Stopping a runaway clock is a lighter touch — the wider office may do it.
const officeOnly = restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'ACCOUNTANT');

// Read: own timesheet (scoped to the caller for technicians in the controller).
timeTrackingRouter.get('/summary/me', catchAsync(timeTrackingController.mySummary));
timeTrackingRouter.get('/', catchAsync(timeTrackingController.getAll));
// Must precede '/:id' so it isn't captured as an id.
timeTrackingRouter.get('/export', catchAsync(timeTrackingController.exportCsv));
timeTrackingRouter.get('/:id', catchAsync(timeTrackingController.getOne));

// Write: office-side adjustments only.
timeTrackingRouter.post('/start', officeOnly, catchAsync(timeTrackingController.start));
timeTrackingRouter.post('/manual', correctionOnly, catchAsync(timeTrackingController.manual));
timeTrackingRouter.post('/:id/stop', officeOnly, catchAsync(timeTrackingController.stop));
timeTrackingRouter.patch('/:id', correctionOnly, catchAsync(timeTrackingController.update));
timeTrackingRouter.delete('/:id', correctionOnly, catchAsync(timeTrackingController.delete));
