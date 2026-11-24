import twilio from 'twilio';
import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { handleUnconfiguredProvider } from './provider-stub';

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
        return handleUnconfiguredProvider({
            logId: log?.id,
            channel: 'SMS',
            missing: 'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER',
            devLog: () => logger.info(`[SMS:DEV] To: ${params.to} | ${params.body}`),
        });
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

/** En-route SMS: company-branded; tracking link and ETA only when we have them. */
export const buildEnRouteText = (
    techName: string,
    opts: { companyName?: string; trackingUrl?: string; eta?: string } = {}
) => {
    const brand = opts.companyName ? `${opts.companyName} technician` : 'technician';
    const subject = techName === 'Your technician' ? `Your ${brand}` : `Your ${brand} ${techName}`;
    return (
        `${subject} is on the way${opts.eta ? ` (ETA ${opts.eta})` : ''}.` +
        (opts.trackingUrl ? ` Track live: ${opts.trackingUrl}` : '')
    );
};

export const smsService = {
    sendText: (phone: string, body: string, companyId?: string, template = 'inbox_reply') =>
        send({ to: phone, template, companyId, body }),

    sendJobEnRoute: (
        phone: string,
        techName: string,
        opts: { companyName?: string; trackingUrl?: string; eta?: string } = {},
        companyId?: string
    ) =>
        send({
            to: phone,
            template: 'job_en_route',
            companyId,
            body: buildEnRouteText(techName, opts),
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

    sendEstimate: (phone: string, total: string, viewUrl: string, companyId?: string) =>
        send({
            to: phone,
            template: 'estimate_sent',
            companyId,
            body: `Your estimate for ${total} is ready. Approve or decline here: ${viewUrl}`,
        }),
};
