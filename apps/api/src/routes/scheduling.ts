import { Router } from 'express';
import { schedulingController } from '../modules/scheduling/scheduling.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const schedulingRouter = Router();

schedulingRouter.use(requireUser);

schedulingRouter.get('/events', catchAsync(schedulingController.getEvents));
schedulingRouter.post('/jobs', catchAsync(schedulingController.createJob)); // Using same router for now
schedulingRouter.patch('/jobs/:id', catchAsync(schedulingController.updateEvent));
