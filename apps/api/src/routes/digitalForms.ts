import { Router } from 'express';
import { digitalFormsController } from '../modules/digital-forms/digital-forms.controller';
import { SUBMISSION_READ_ROLES } from '../modules/digital-forms/digital-forms.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';

/**
 * Public (no-auth): the customer's certificate PDF link, mounted at
 * /public/certificates behind publicEndpointLimiter (see server.ts). The
 * unguessable token is the only credential (same model as
 * /public/payments/invoices/:token/pdf).
 */
export const publicCertificatesRouter = Router();
publicCertificatesRouter.get('/:token/pdf', catchAsync(digitalFormsController.publicPdf));

export const digitalFormsRouter = Router();

digitalFormsRouter.use(requireUser);

digitalFormsRouter.post('/templates', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.createTemplate));
digitalFormsRouter.get('/templates', catchAsync(digitalFormsController.getTemplates));
digitalFormsRouter.patch('/templates/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.updateTemplate));

// Starter CoC record templates ("Add from library" in the office builder).
digitalFormsRouter.get('/library', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.getLibrary));
digitalFormsRouter.post('/library/:key', restrictTo('ADMIN', 'OFFICE'), idempotency, catchAsync(digitalFormsController.addFromLibrary));

// Tech-facing: forms + this job's submissions + the caller's CoC permission.
digitalFormsRouter.get('/jobs/:jobId/forms', catchAsync(digitalFormsController.getJobForms));

// Field write — offline-queued, so it carries an Idempotency-Key.
digitalFormsRouter.post('/submissions', idempotency, catchAsync(digitalFormsController.submitForm));
// Reading every CoC submission company-wide is an office review view — never TECHNICIAN.
// (Techs see their own job's submissions via GET /digital-forms/jobs/:jobId/forms.)
digitalFormsRouter.get('/submissions', restrictTo(...SUBMISSION_READ_ROLES), catchAsync(digitalFormsController.getSubmissions));
digitalFormsRouter.get('/submissions/:id', restrictTo(...SUBMISSION_READ_ROLES), catchAsync(digitalFormsController.getSubmissionDetails));
// Certificate PDF: office roles, or the technician who submitted it (checked in the service).
digitalFormsRouter.get('/submissions/:id/pdf', catchAsync(digitalFormsController.getSubmissionPdf));
// Email / WhatsApp the certificate to the customer. Idempotent so a double click can't double-send.
digitalFormsRouter.post('/submissions/:id/send', restrictTo(...SUBMISSION_READ_ROLES), idempotency, catchAsync(digitalFormsController.sendSubmission));
