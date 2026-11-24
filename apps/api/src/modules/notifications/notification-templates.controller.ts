import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { notificationTemplatesService } from './notification-templates.service';
import { NOTIFICATION_PLACEHOLDERS } from './notification-templates';

export const notificationTemplatesController = {
    get: async (req: Request, res: Response) => {
        const notifications = await notificationTemplatesService.get(req.user!.companyId);
        res.status(StatusCodes.OK).json({
            status: 'success',
            data: { notifications, placeholders: NOTIFICATION_PLACEHOLDERS },
        });
    },

    update: async (req: Request, res: Response) => {
        const notifications = await notificationTemplatesService.update(req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({
            status: 'success',
            data: { notifications },
        });
    },
};
