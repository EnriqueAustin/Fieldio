import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

const API_VERSION = 'v18.0';

const isConfigured = () =>
    Boolean(config.WHATSAPP_API_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID);

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
            channel: 'WHATSAPP',
            toAddress: params.to,
            template: params.template,
            payload: params.payload as any,
            status: 'QUEUED',
        },
    }).catch(() => null);

    if (!isConfigured()) {
        logger.info(`[WHATSAPP:DEV] To: ${params.to} | ${params.body}`);
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: 'dev-stub' },
            }).catch(() => undefined);
        }
        return { ok: true, dev: true };
    }

    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const phone = params.to.replace(/[^0-9+]/g, '');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone,
                type: 'text',
                text: { body: params.body },
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            throw new Error(data.error?.message ?? `HTTP ${response.status}`);
        }

        const messageId = data.messages?.[0]?.id ?? null;
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: messageId },
            }).catch(() => undefined);
        }
        return { ok: true, id: messageId };
    } catch (err: any) {
        logger.error({ err: err.message }, 'WhatsApp send failed');
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'FAILED', error: err.message },
            }).catch(() => undefined);
        }
        return { ok: false, error: err.message };
    }
};

export const whatsappService = {
    isConfigured,

    sendText: (phone: string, body: string, companyId?: string) =>
        send({ to: phone, template: 'inbox_reply', companyId, body }),

    sendJobEnRoute: (phone: string, techName: string, trackingUrl?: string, companyId?: string) =>
        send({
            to: phone,
            template: 'job_en_route',
            companyId,
            body: `Your technician ${techName} is on the way!${trackingUrl ? `\n\nTrack live: ${trackingUrl}` : ''}`,
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
            body: `Your job "${jobTitle}" is complete. Thanks for choosing us! 🙏`,
        }),

    sendInvoice: (phone: string, invoiceNumber: string, total: string, payUrl: string, companyId?: string) =>
        send({
            to: phone,
            template: 'invoice_sent',
            companyId,
            body: `Invoice ${invoiceNumber} for ${total} is ready.\n\nView & pay: ${payUrl}`,
        }),

    sendAppointmentReminder: (phone: string, when: string, companyId?: string) =>
        send({
            to: phone,
            template: 'appointment_reminder',
            companyId,
            body: `Reminder: your appointment is scheduled for ${when}. Reply to confirm or reschedule.`,
        }),

    sendReviewRequest: (phone: string, companyName: string, reviewUrl: string, companyId?: string) =>
        send({
            to: phone,
            template: 'review_request',
            companyId,
            body: `Thanks for choosing ${companyName}! We'd love your feedback.\n\nLeave a review: ${reviewUrl}`,
        }),

    sendEstimate: (phone: string, total: string, viewUrl: string, companyId?: string) =>
        send({
            to: phone,
            template: 'estimate_sent',
            companyId,
            body: `Your estimate for ${total} is ready for review.\n\nView: ${viewUrl}`,
        }),
};
