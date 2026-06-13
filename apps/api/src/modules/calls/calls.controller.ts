import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { callsService } from './calls.service';

export const callsController = {
    list: async (req: Request, res: Response) => {
        const calls = await callsService.list(req.user!.companyId, Number(req.query.limit) || 100);
        res.status(StatusCodes.OK).json({ status: 'success', data: { calls } });
    },

    create: async (req: Request, res: Response) => {
        const result = await callsService.log({ companyId: req.user!.companyId, userId: req.user!.userId, ...req.body });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },

    // Twilio Voice webhook — incoming
    twilioVoice: async (req: Request, res: Response) => {
        const companyId = (req.query.companyId as string) || req.body.companyId;
        const from = req.body.From as string;
        const to = req.body.To as string;
        const callSid = req.body.CallSid as string;
        if (companyId && from) await callsService.notifyIncoming(companyId, from);
        if (companyId) {
            await callsService.log({
                companyId,
                direction: 'INBOUND',
                fromNumber: from,
                toNumber: to,
                status: 'RINGING',
                providerId: callSid,
            });
        }
        // Polite default TwiML — let user override on Twilio side
        res.status(StatusCodes.OK).type('text/xml').send('<Response><Say>Thank you for calling. Please hold.</Say></Response>');
    },

    twilioStatus: async (req: Request, res: Response) => {
        const companyId = (req.query.companyId as string) || req.body.companyId;
        const callSid = req.body.CallSid as string;
        const callStatus = req.body.CallStatus as string;
        const duration = Number(req.body.CallDuration || 0);
        const recordingUrl = req.body.RecordingUrl as string | undefined;
        if (!companyId || !callSid) {
            res.status(StatusCodes.OK).send();
            return;
        }
        const mapped =
            callStatus === 'completed' ? 'COMPLETED' :
            callStatus === 'no-answer' || callStatus === 'busy' ? 'MISSED' :
            callStatus === 'failed' ? 'FAILED' :
            'COMPLETED';
        const { prisma } = await import('@fieldio/database');
        await prisma.callLog.updateMany({
            where: { providerId: callSid, companyId },
            data: { status: mapped as any, durationSec: duration, recordingUrl, endedAt: new Date() },
        });
        res.status(StatusCodes.OK).send();
    },
};
