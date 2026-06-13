import twilio from 'twilio';
import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

let twilioClient: ReturnType<typeof twilio> | null = null;

const getTwilio = () => {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
        return null;
    }
    if (!twilioClient) {
        twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    }
    return twilioClient;
};

const send = async (params: {
    to: string;
    body: string;
    template: string;
    companyId?: string;
    payload?: Record<string, unknown>;
}) => {
    const log = await prisma.notificationLog.create({
        data: {
            companyId: params.companyId ?? '',
            channel: 'SMS',
            toAddress: params.to,
            template: params.template,
            payload: params.payload as any,
            status: 'QUEUED',
        },
    }).catch(() => null);

    const client = getTwilio();
    if (!client) {
        logger.info(`[SMS:DEV] To: ${params.to} | ${params.body}`);
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: 'dev-stub' },
            }).catch(() => undefined);
        }
        return { ok: true, dev: true };
    }

    try {
        const msg = await client.messages.create({
            from: config.TWILIO_FROM_NUMBER!,
            to: params.to,
            body: params.body,
        });
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: msg.sid },
            }).catch(() => undefined);
        }
        return { ok: true, sid: msg.sid };
    } catch (err: any) {
        logger.error({ err: err.message }, 'SMS send failed');
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'FAILED', error: err.message },
            }).catch(() => undefined);
        }
        return { ok: false, error: err.message };
    }
};

export const smsService = {
    sendText: (phone: string, body: string, companyId?: string) =>
        send({ to: phone, template: 'inbox_reply', companyId, body }),

    sendJobEnRoute: (phone: string, techName: string, eta?: string, companyId?: string) =>
        send({
            to: phone,
            template: 'job_en_route',
            companyId,
            body: `Your Fieldio technician ${techName} is on the way${eta ? ` — ETA ${eta}` : ''}.`,
        }),

    sendJobStarted: (phone: string, techName: string, companyId?: string) =>
        send({
            to: phone,
            template: 'job_started',
            companyId,
            body: `${techName} has arrived and started work on your service request.`,
        }),

    sendJobCompleted: (phone: string, jobTitle: string, companyId?: string) =>
        send({
            to: phone,
            template: 'job_completed',
            companyId,
            body: `Your job "${jobTitle}" is complete. Thanks for choosing us!`,
        }),

    sendAppointmentReminder: (phone: string, when: string, companyId?: string) =>
        send({
            to: phone,
            template: 'appointment_reminder',
            companyId,
            body: `Reminder: your appointment is scheduled for ${when}.`,
        }),
};
