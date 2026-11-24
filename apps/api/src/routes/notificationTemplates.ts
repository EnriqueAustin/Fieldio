import { Router } from 'express';
import { notificationTemplatesController } from '../modules/notifications/notification-templates.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

// Automated customer notification templates. These carry customer-facing copy
// and the master send gate — office config, never technician. ADMIN only, in
// line with who may PATCH company settings.
export const notificationTemplatesRouter = Router();
notificationTemplatesRouter.use(requireUser);

notificationTemplatesRouter.get('/', restrictTo('ADMIN'), catchAsync(notificationTemplatesController.get));
notificationTemplatesRouter.put('/', restrictTo('ADMIN'), catchAsync(notificationTemplatesController.update));
