import { Router } from 'express';
import { digitalFormsController } from '../modules/digital-forms/digital-forms.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const digitalFormsRouter = Router();

digitalFormsRouter.use(requireUser);

digitalFormsRouter.post('/templates', restrictTo('ADMIN', 'OFFICE'), catchAsync(digitalFormsController.createTemplate));
digitalFormsRouter.get('/templates', catchAsync(digitalFormsController.getTemplates));

digitalFormsRouter.post('/submissions', catchAsync(digitalFormsController.submitForm));
digitalFormsRouter.get('/submissions', catchAsync(digitalFormsController.getSubmissions));
digitalFormsRouter.get('/submissions/:id', catchAsync(digitalFormsController.getSubmissionDetails));
