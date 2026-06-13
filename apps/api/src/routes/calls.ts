import { Router } from 'express';
import express from 'express';
import { callsController } from '../modules/calls/calls.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const callsRouter = Router();
callsRouter.use(requireUser);
callsRouter.get('/', catchAsync(callsController.list));
callsRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'CSR', 'DISPATCHER'), catchAsync(callsController.create));

// Public webhooks (Twilio sends form-urlencoded)
export const publicCallsRouter = Router();
publicCallsRouter.use(express.urlencoded({ extended: true }));
publicCallsRouter.post('/twilio/voice', catchAsync(callsController.twilioVoice));
publicCallsRouter.post('/twilio/status', catchAsync(callsController.twilioStatus));
