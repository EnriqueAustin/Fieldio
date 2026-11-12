import { Router } from 'express';
import { digitalFormsController } from '../modules/digital-forms/digital-forms.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';

export const digitalFormsRouter = Router();

digitalFormsRouter.use(requireUser);

digitalFormsRouter.post('/templates', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.createTemplate));
digitalFormsRouter.get('/templates', catchAsync(digitalFormsController.getTemplates));
digitalFormsRouter.patch('/templates/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.updateTemplate));

// Tech-facing: forms + this job's submissions + the caller's CoC permission.
digitalFormsRouter.get('/jobs/:jobId/forms', catchAsync(digitalFormsController.getJobForms));

// Field write — offline-queued, so it carries an Idempotency-Key.
digitalFormsRouter.post('/submissions', idempotency, catchAsync(digitalFormsController.submitForm));
// Reading every CoC submission company-wide is an office review view — never TECHNICIAN.
// (Techs see their own job's submissions via GET /digital-forms/jobs/:jobId/forms.)
const SUBMISSION_READ = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;
digitalFormsRouter.get('/submissions', restrictTo(...SUBMISSION_READ), catchAsync(digitalFormsController.getSubmissions));
digitalFormsRouter.get('/submissions/:id', restrictTo(...SUBMISSION_READ), catchAsync(digitalFormsController.getSubmissionDetails));
