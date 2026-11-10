import express, { Router } from 'express';
import { messagingController } from '../modules/messaging/messaging.controller';
import { verifyTwilioSignature } from '../modules/messaging/twilio-webhook';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const messagingRouter = Router();
messagingRouter.use(requireUser);

// The customer SMS inbox holds personal data for every customer, so it is
// office-only (POPIA). Technicians are never shown it.
const INBOX_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES', 'ACCOUNTANT'] as const;

messagingRouter.get('/threads', restrictTo(...INBOX_ROLES), catchAsync(messagingController.listThreads));
messagingRouter.get('/threads/:id', restrictTo(...INBOX_ROLES), catchAsync(messagingController.getThread));
messagingRouter.post('/threads/:id/status', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR'), catchAsync(messagingController.setStatus));
messagingRouter.post('/send', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'), catchAsync(messagingController.send));

// Public, no-auth: Twilio inbound webhook. Twilio posts form-urlencoded and signs
// the request; unsigned or forged requests are rejected before the controller.
export const publicMessagingRouter = Router();
publicMessagingRouter.use(express.urlencoded({ extended: false }));
publicMessagingRouter.post('/twilio/inbound', verifyTwilioSignature, catchAsync(messagingController.twilioInbound));
