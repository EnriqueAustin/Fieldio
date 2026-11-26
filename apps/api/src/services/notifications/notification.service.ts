import { prisma } from '@fieldio/database';
import { socketService } from '../socket.service';
import { emailService } from './email.service';
import { smsService } from './sms.service';
import { whatsappService } from './whatsapp.service';
import { paymentsService } from '../../modules/payments/payments.service';
import { pushService } from '../../modules/push/push.service';
import { normalizeCompanySettings } from '../../modules/company/company-settings';
import {
    isDefaultNotificationTemplate,
    renderNotificationTemplate,
    type NotificationEvent,
    type NotificationSettings,
    type NotificationTemplate,
} from '../../modules/notifications/notification-templates';
import { logger } from '../../utils/logger';

type InternalType = 'JOB_ASSIGNED' | 'MENTION' | 'ALERT' | 'SYSTEM';
type CustomerType =
    | 'JOB_EN_ROUTE'
    | 'JOB_STARTED'
    | 'JOB_COMPLETED'
    | 'INVOICE_SENT'
    | 'PAYMENT_RECEIPT'
    | 'APPOINTMENT_REMINDER'
    | 'ESTIMATE_SENT'
    | 'REVIEW_REQUEST';

// Customer message type -> the template event that governs it. Types without an
// entry (JOB_STARTED, plain reminders) are only subject to the master gate;
// PAYMENT_RECEIPT and REVIEW_REQUEST are not governed by these settings at all.
const EVENT_FOR_TYPE: Partial<Record<CustomerType, NotificationEvent>> = {
    JOB_EN_ROUTE: 'TECH_EN_ROUTE',
    JOB_COMPLETED: 'JOB_COMPLETED',
    INVOICE_SENT: 'INVOICE_SENT',
    ESTIMATE_SENT: 'QUOTE_SENT',
};
const MASTER_GATED_TYPES: CustomerType[] = ['JOB_STARTED', 'APPOINTMENT_REMINDER'];

type GateResult =
    | { send: false }
    | { send: true; event?: NotificationEvent; template?: NotificationTemplate; customized: boolean };

/**
 * Decide whether a customer message goes out. The master gate and the per-event
 * flag both default to ON (see notification-templates.ts), so an untouched
 * company keeps receiving the built-in lifecycle messages. A template the
 * company edited ("customized") has its text/channel used instead.
 *
 * APPOINTMENT_REMINDER is shared by the booking confirmation and the 24h/1h
 * reminders; a caller marks the confirmation with `payload.event = 'JOB_BOOKED'`.
 */
export const resolveCustomerNotification = (
    notifications: NotificationSettings,
    type: CustomerType,
    payload: { event?: string } = {}
): GateResult => {
    const event: NotificationEvent | undefined =
        type === 'APPOINTMENT_REMINDER' && payload.event === 'JOB_BOOKED'
            ? 'JOB_BOOKED'
            : EVENT_FOR_TYPE[type];

    if (!event && !MASTER_GATED_TYPES.includes(type)) return { send: true, customized: false };
    if (!notifications.enabled) return { send: false };
    if (!event) return { send: true, customized: false };

    const template = notifications.templates?.[event];
    if (!template) return { send: true, event, customized: false };
    if (!template.enabled) return { send: false };
    return { send: true, event, template, customized: !isDefaultNotificationTemplate(event, template) };
};

const buildTemplateVars = (
    event: NotificationEvent,
    ctx: {
        customerName: string;
        companyName: string;
        payload: any;
        payUrl: string;
        dueDate: string;
        formatMoney: (n: unknown) => string;
    }
): Record<string, string | number> => {
    const { payload } = ctx;
    const base = { customerName: ctx.customerName, companyName: ctx.companyName };
    switch (event) {
        case 'JOB_BOOKED':
            return {
                ...base,
                // `when` is the already-formatted date and time of the visit.
                jobDate: payload.when ?? '',
            };
        case 'TECH_EN_ROUTE':
            return {
                ...base,
                technicianName: payload.techName ?? 'Your technician',
                trackingUrl: payload.trackingUrl ?? '',
                // e.g. "15 min"; blank without a fresh GPS fix.
                eta: typeof payload.eta === 'string' ? payload.eta : '',
            };
        case 'JOB_COMPLETED':
            return {
                ...base,
                technicianName: payload.techName ?? 'Our technician',
                reference: payload.reference ?? payload.jobTitle ?? '',
            };
        case 'INVOICE_SENT':
            return {
                ...base,
                invoiceNumber: payload.invoiceNumber ?? String(payload.invoiceId ?? '').slice(0, 8),
                amountDue: ctx.formatMoney(payload.total),
                dueDate: ctx.dueDate,
                payUrl: ctx.payUrl,
            };
        case 'QUOTE_SENT':
            return {
                ...base,
                quoteNumber: payload.quoteNumber ?? String(payload.estimateId ?? '').slice(0, 8),
                quoteTotal: ctx.formatMoney(payload.total),
                quoteUrl: payload.viewUrl ?? '',
            };
    }
};

/** Send a company-authored message on the channel they chose, with sensible fallbacks. */
const deliverCustom = async (
    customer: { email: string | null; phone: string | null },
    companyId: string,
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
    subject: string,
    body: string,
    waEnabled: boolean,
    event: NotificationEvent
) => {
    const template = `custom_${event.toLowerCase()}`;
    const viaPhone = async () => {
        if (!customer.phone) return false;
        // WhatsApp when the company has it live and didn't pick SMS; SMS otherwise.
        if (waEnabled && channel !== 'SMS') {
            await whatsappService.sendText(customer.phone, body, companyId, template);
        } else {
            await smsService.sendText(customer.phone, body, companyId, template);
        }
        return true;
    };
    const viaEmail = async () => {
        if (!customer.email) return false;
        await emailService.sendRaw(customer.email, subject || 'Update from your service provider', body, companyId);
        return true;
    };
    if (channel === 'EMAIL') {
        if (!(await viaEmail())) await viaPhone();
    } else if (!(await viaPhone())) {
        await viaEmail();
    }
};

export const notificationService = {
    /**
     * In-app feed + socket + Web Push to the user's registered phones.
     * `push.jobId` collapses repeat alerts for one job into a single phone
     * notification; `push.url` is the in-app page the alert opens;
     * `push.body` replaces the message on the phone (lock screens must never
     * show money, so callers whose in-app text has amounts pass one without).
     */
    notifyUser: async (
        userId: string,
        companyId: string,
        type: InternalType,
        title: string,
        message: string,
        push: { url?: string; jobId?: string; body?: string } = {}
    ) => {
        const notification = await prisma.notification.create({
            data: { companyId, userId, type, title, message },
        });
        // Personal feed: only this user's sockets, never the whole company.
        socketService.emitToUser(userId, 'notification:received', notification);
        // Fire-and-forget so a slow push service never delays the office request;
        // sendToUser never throws. Title/message only: no prices in the payload.
        void pushService.sendToUser(userId, companyId, {
            title,
            body: push.body ?? message,
            url: push.url ?? '/',
            tag: push.jobId ? `job-${push.jobId}` : `notification-${notification.id}`,
        });
        return notification;
    },

    // Fan a quote approve/decline back to the office so staff know it closed.
    // Best-effort: notifies every active back-office user (ADMIN/OFFICE/DISPATCHER/
    // CSR/SALES) via the in-app notification feed (which also pushes over socket).
    /** In-app + socket alert to every active office-side user. */
    notifyStaff: async (companyId: string, title: string, message: string) => {
        const staff = await prisma.user.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                role: { in: ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] },
            },
            select: { id: true },
        });
        await Promise.all(
            staff.map((s) => notificationService.notifyUser(s.id, companyId, 'ALERT', title, message))
        );
    },

    notifyStaffEstimateDecision: async (
        companyId: string,
        decision: 'APPROVED' | 'DECLINED',
        payload: { estimateId: string; customerName?: string; total?: number; signerName?: string }
    ) => {
        const staff = await prisma.user.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                role: { in: ['ADMIN', 'OFFICE', 'DISPATCHER', 'CSR', 'SALES'] },
            },
            select: { id: true },
        });
        if (staff.length === 0) return;

        const shortId = payload.estimateId.slice(0, 8);
        const who = payload.customerName ?? 'A customer';
        const amount =
            payload.total != null ? ` (R ${Number(payload.total).toFixed(2)})` : '';
        const title = decision === 'APPROVED' ? 'Quote approved' : 'Quote declined';
        const describe = (withAmount: string) =>
            decision === 'APPROVED'
                ? `${who} approved quote #${shortId}${withAmount}${payload.signerName ? `, signed by ${payload.signerName}` : ''}.`
                : `${who} declined quote #${shortId}${withAmount}.`;
        const message = describe(amount);
        // The phone notification can sit on a lock screen: same text, no amount.
        const pushBody = describe('');

        await Promise.all(
            staff.map((s) =>
                notificationService.notifyUser(s.id, companyId, 'ALERT', title, message, { body: pushBody })
            )
        );
    },

    notifyCustomer: async (
        customerId: string,
        companyId: string,
        type: CustomerType,
        payload: any = {}
    ) => {
        const [customer, company] = await Promise.all([
            prisma.customer.findFirst({ where: { id: customerId, companyId } }),
            prisma.company.findFirst({ where: { id: companyId } }),
        ]);
        if (!customer || !company) return;

        const settings = normalizeCompanySettings(company.settings);
        const waEnabled = settings.integrations.whatsapp.enabled && whatsappService.isConfigured();

        const gate = resolveCustomerNotification(settings.notifications, type, payload);
        if (!gate.send) {
            logger.info({ companyId, type }, 'Customer notification disabled in company settings; skipped');
            return;
        }

        const currency = settings.regional.currency;
        const formatMoney = (n: unknown) => `${currency} ${Number(n ?? 0).toFixed(2)}`;

        // The company edited this template: send their text on their channel.
        if (gate.customized && gate.event && gate.template) {
            let payUrl = '';
            let dueDate = '';
            if (type === 'INVOICE_SENT' && payload.invoiceId) {
                payUrl = await paymentsService.getPayLinkForInvoice(payload.invoiceId, companyId);
                const invoice = await prisma.invoice.findFirst({
                    where: { id: payload.invoiceId, companyId },
                    select: { dueDate: true },
                });
                if (invoice?.dueDate) {
                    dueDate = new Intl.DateTimeFormat('en-ZA', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: settings.regional.timezone,
                    }).format(new Date(invoice.dueDate));
                }
            }
            const rendered = renderNotificationTemplate(
                gate.template,
                buildTemplateVars(gate.event, {
                    customerName: customer.name,
                    companyName: company.name,
                    payload,
                    payUrl,
                    dueDate,
                    formatMoney,
                })
            );
            const trackingUrl = String(payload.trackingUrl ?? '');
            // Never drop the live-tracking link just because the custom text omits it.
            const body =
                gate.event === 'TECH_EN_ROUTE' && trackingUrl && !rendered.body.includes(trackingUrl)
                    ? `${rendered.body}\nTrack live: ${trackingUrl}`
                    : rendered.body;
            await deliverCustom(customer, companyId, rendered.channel, rendered.subject, body, waEnabled, gate.event);
            return;
        }

        switch (type) {
            case 'JOB_EN_ROUTE': {
                const techName = payload.techName ?? 'Your technician';
                const trackingUrl = payload.trackingUrl || undefined;
                if (customer.phone && waEnabled) {
                    await whatsappService.sendJobEnRoute(
                        customer.phone, techName, trackingUrl, companyId, company.name, payload.eta || undefined
                    );
                } else if (customer.phone) {
                    await smsService.sendJobEnRoute(
                        customer.phone,
                        techName,
                        { companyName: company.name, trackingUrl, eta: payload.eta },
                        companyId
                    );
                }
                break;
            }

            case 'JOB_STARTED':
                if (customer.phone && waEnabled) {
                    await whatsappService.sendJobStarted(customer.phone, payload.techName ?? 'Your technician', companyId);
                } else if (customer.phone) {
                    await smsService.sendJobStarted(customer.phone, payload.techName ?? 'Your technician', companyId);
                }
                break;

            case 'JOB_COMPLETED':
                if (customer.phone && waEnabled) {
                    await whatsappService.sendJobCompleted(customer.phone, payload.jobTitle ?? 'Service', companyId);
                } else if (customer.phone) {
                    await smsService.sendJobCompleted(customer.phone, payload.jobTitle ?? 'Service', companyId);
                }
                break;

            case 'INVOICE_SENT':
                if (customer.email && payload.invoiceId) {
                    const payUrl = await paymentsService.getPayLinkForInvoice(payload.invoiceId, companyId);
                    await emailService.sendInvoice(
                        customer.email,
                        { id: payload.invoiceId, total: payload.total ?? 0, payUrl },
                        companyId
                    );
                    if (customer.phone && waEnabled) {
                        const total = formatMoney(payload.total);
                        await whatsappService.sendInvoice(
                            customer.phone,
                            payload.invoiceNumber ?? payload.invoiceId.slice(0, 8),
                            total, payUrl, companyId
                        );
                    }
                }
                break;

            case 'PAYMENT_RECEIPT':
                if (customer.email)
                    await emailService.sendPaymentReceipt(
                        customer.email,
                        { id: payload.invoiceId, amount: payload.amount },
                        companyId
                    );
                break;

            case 'APPOINTMENT_REMINDER':
                if (customer.phone && waEnabled) {
                    await whatsappService.sendAppointmentReminder(customer.phone, payload.when, companyId);
                } else if (customer.phone) {
                    await smsService.sendAppointmentReminder(customer.phone, payload.when, companyId);
                }
                break;

            case 'ESTIMATE_SENT': {
                if (customer.email)
                    await emailService.sendEstimate(
                        customer.email,
                        { id: payload.estimateId, total: payload.total ?? 0, viewUrl: payload.viewUrl ?? '' },
                        companyId
                    );
                if (customer.phone) {
                    const total = formatMoney(payload.total);
                    // Prefer WhatsApp when configured, otherwise fall back to SMS so the
                    // approval link always reaches the customer on some channel.
                    if (waEnabled) {
                        await whatsappService.sendEstimate(customer.phone, total, payload.viewUrl ?? '', companyId);
                    } else {
                        await smsService.sendEstimate(customer.phone, total, payload.viewUrl ?? '', companyId);
                    }
                }
                break;
            }

            case 'REVIEW_REQUEST':
                if (customer.phone && waEnabled && payload.reviewUrl) {
                    await whatsappService.sendReviewRequest(
                        customer.phone, company.name, payload.reviewUrl, companyId
                    );
                }
                if (customer.email && payload.reviewUrl) {
                    await emailService.sendReviewRequest(
                        customer.email, company.name, payload.reviewUrl, companyId
                    );
                }
                break;
        }
    },
};
