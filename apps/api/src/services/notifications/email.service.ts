import { Resend } from 'resend';
import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

let resendClient: Resend | null = null;

const getResend = (): Resend | null => {
    if (!config.RESEND_API_KEY) return null;
    if (!resendClient) resendClient = new Resend(config.RESEND_API_KEY);
    return resendClient;
};

const send = async (params: {
    to: string;
    subject: string;
    html: string;
    template: string;
    companyId?: string;
    payload?: Record<string, unknown>;
}) => {
    const log = await prisma.notificationLog.create({
        data: {
            companyId: params.companyId ?? '',
            channel: 'EMAIL',
            toAddress: params.to,
            template: params.template,
            payload: params.payload as any,
            status: 'QUEUED',
        },
    }).catch(() => null);

    const client = getResend();
    if (!client) {
        logger.info(
            `[EMAIL:DEV] To: ${params.to} | Subject: ${params.subject}\n${params.html}`
        );
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: 'dev-stub' },
            }).catch(() => undefined);
        }
        return { ok: true, dev: true };
    }

    try {
        const result = await client.emails.send({
            from: config.EMAIL_FROM,
            to: params.to,
            subject: params.subject,
            html: params.html,
        });
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'SENT', providerId: result.data?.id ?? null },
            }).catch(() => undefined);
        }
        return { ok: true, id: result.data?.id };
    } catch (err: any) {
        logger.error({ err: err.message }, 'Email send failed');
        if (log) {
            await prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'FAILED', error: err.message },
            }).catch(() => undefined);
        }
        return { ok: false, error: err.message };
    }
};

const wrap = (title: string, body: string) => `
<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,.05);">
    <h1 style="font-size:20px; margin:0 0 16px;">${title}</h1>
    <div style="color:#374151; line-height:1.6;">${body}</div>
    <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
    <p style="color:#9ca3af; font-size:12px;">Sent via Fieldio</p>
  </div>
</body></html>`;

export const emailService = {
    sendWelcomeEmail: (email: string, name: string, companyId?: string) =>
        send({
            to: email,
            subject: 'Welcome to Fieldio',
            template: 'welcome',
            companyId,
            html: wrap('Welcome to Fieldio', `<p>Hi ${name},</p><p>Your account is ready.</p>`),
        }),

    sendJobAssigned: (email: string, jobTitle: string, jobId: string, companyId?: string) =>
        send({
            to: email,
            subject: `New job assigned: ${jobTitle}`,
            template: 'job_assigned',
            companyId,
            payload: { jobId },
            html: wrap(
                'New job assigned',
                `<p>You have been assigned to <strong>${jobTitle}</strong>.</p><p><a href="${config.WEB_URL}/jobs/${jobId}">View job</a></p>`
            ),
        }),

    sendInvoice: (
        email: string,
        invoice: { id: string; total: number | string; payUrl: string },
        companyId?: string
    ) =>
        send({
            to: email,
            subject: `Invoice ${invoice.id.slice(0, 8)} — $${Number(invoice.total).toFixed(2)}`,
            template: 'invoice_sent',
            companyId,
            payload: { invoiceId: invoice.id },
            html: wrap(
                'Your invoice is ready',
                `<p>Total due: <strong>$${Number(invoice.total).toFixed(2)}</strong></p>
                 <p><a href="${invoice.payUrl}" style="display:inline-block; background:#111827; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none;">View &amp; pay invoice</a></p>`
            ),
        }),

    sendPaymentReceipt: (
        email: string,
        invoice: { id: string; amount: number | string },
        companyId?: string
    ) =>
        send({
            to: email,
            subject: `Payment received — thank you`,
            template: 'payment_receipt',
            companyId,
            payload: { invoiceId: invoice.id },
            html: wrap(
                'Payment received',
                `<p>We received your payment of <strong>$${Number(invoice.amount).toFixed(2)}</strong>. Thank you!</p>`
            ),
        }),

    sendEstimate: (
        email: string,
        estimate: { id: string; total: number | string; viewUrl: string },
        companyId?: string
    ) =>
        send({
            to: email,
            subject: `Estimate ready for review`,
            template: 'estimate_sent',
            companyId,
            payload: { estimateId: estimate.id },
            html: wrap(
                'Estimate ready',
                `<p>Total: <strong>$${Number(estimate.total).toFixed(2)}</strong></p>
                 <p><a href="${estimate.viewUrl}">View estimate</a></p>`
            ),
        }),
};
