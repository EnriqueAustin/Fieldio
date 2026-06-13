import { Router } from 'express';
import { messagingController } from '../modules/messaging/messaging.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const messagingRouter = Router();
messagingRouter.use(requireUser);

messagingRouter.get('/threads', catchAsync(messagingController.listThreads));
messagingRouter.get('/threads/:id', catchAsync(messagingController.getThread));
messagingRouter.post('/threads/:id/status', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR'), catchAsync(messagingController.setStatus));
messagingRouter.post('/send', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'), catchAsync(messagingController.send));

// Public, no-auth: Twilio inbound webhook
export const publicMessagingRouter = Router();
publicMessagingRouter.post('/twilio/inbound', catchAsync(messagingController.twilioInbound));
