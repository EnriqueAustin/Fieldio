import { Router } from 'express';
import express from 'express';
import { callsController } from '../modules/calls/calls.controller';
import { verifyTwilioSignature } from '../modules/messaging/twilio-webhook';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

const STAFF = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] as const;

export const callsRouter = Router();
callsRouter.use(requireUser);
callsRouter.get('/', restrictTo(...STAFF), catchAsync(callsController.list));
callsRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'CSR', 'DISPATCHER'), catchAsync(callsController.create));

// Public webhooks (Twilio sends form-urlencoded and signs every request).
export const publicCallsRouter = Router();
publicCallsRouter.use(express.urlencoded({ extended: false }));
publicCallsRouter.post('/twilio/voice', verifyTwilioSignature, catchAsync(callsController.twilioVoice));
publicCallsRouter.post('/twilio/status', verifyTwilioSignature, catchAsync(callsController.twilioStatus));
