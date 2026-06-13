import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { messagingService } from './messaging.service';

export const messagingController = {
    listThreads: async (req: Request, res: Response) => {
        const threads = await messagingService.listThreads(req.user!.companyId, {
            status: (req.query.status as any) || undefined,
        });
        res.status(StatusCodes.OK).json({ status: 'success', data: { threads } });
    },
    getThread: async (req: Request, res: Response) => {
        const thread = await messagingService.getThread(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { thread } });
    },
    send: async (req: Request, res: Response) => {
        const result = await messagingService.send(req.user!.companyId, req.user!.userId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },
    setStatus: async (req: Request, res: Response) => {
        await messagingService.setStatus(req.params.id, req.user!.companyId, req.body.status);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
    // Public Twilio inbound webhook. companyId resolved via the To: number setting.
    twilioInbound: async (req: Request, res: Response) => {
        const companyId = (req.query.companyId as string) || req.body.companyId;
        if (!companyId) {
            res.status(StatusCodes.OK).type('text/xml').send('<Response/>');
            return;
        }
        const isWhatsapp = (req.body.From as string)?.startsWith('whatsapp:');
        const phone = (req.body.From as string)?.replace(/^whatsapp:/, '');
        const body = req.body.Body as string;
        const mediaUrls: string[] = [];
        const numMedia = Number(req.body.NumMedia || 0);
        for (let i = 0; i < numMedia; i++) {
            const u = req.body[`MediaUrl${i}`];
            if (u) mediaUrls.push(u);
        }
        if (phone && body) {
            await messagingService.receiveInbound({
                companyId,
                phone,
                body,
                channel: isWhatsapp ? 'WHATSAPP' : 'SMS',
                providerId: req.body.MessageSid,
                mediaUrls,
            });
        }
        res.status(StatusCodes.OK).type('text/xml').send('<Response/>');
    },
};
