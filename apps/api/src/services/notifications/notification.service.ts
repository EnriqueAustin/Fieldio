import { prisma } from '@fieldio/database';
import { socketService } from '../socket.service';
import { emailService } from './email.service';
import { smsService } from './sms.service';
import { whatsappService } from './whatsapp.service';
import { paymentsService } from '../../modules/payments/payments.service';
import { normalizeCompanySettings } from '../../modules/company/company-settings';

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

export const notificationService = {
    notifyUser: async (
        userId: string,
        companyId: string,
        type: InternalType,
        title: string,
        message: string
    ) => {
        const notification = await prisma.notification.create({
            data: { companyId, userId, type, title, message },
        });
        socketService.emitToCompany(companyId, 'notification:received', notification);
        return notification;
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

        switch (type) {
            case 'JOB_EN_ROUTE': {
                const techName = payload.techName ?? 'Your technician';
                const trackingUrl = payload.trackingUrl;
                if (customer.phone && waEnabled) {
                    await whatsappService.sendJobEnRoute(customer.phone, techName, trackingUrl, companyId);
                } else if (customer.phone) {
                    const msg = trackingUrl
                        ? `Your technician ${techName} is on the way! Track live: ${trackingUrl}`
                        : undefined;
                    await smsService.sendJobEnRoute(customer.phone, techName, payload.eta, companyId);
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
                        const currency = settings.regional.currency;
                        const total = `${currency} ${Number(payload.total ?? 0).toFixed(2)}`;
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

            case 'ESTIMATE_SENT':
                if (customer.email)
                    await emailService.sendEstimate(
                        customer.email,
                        { id: payload.estimateId, total: payload.total ?? 0, viewUrl: payload.viewUrl ?? '' },
                        companyId
                    );
                if (customer.phone && waEnabled) {
                    const currency = settings.regional.currency;
                    const total = `${currency} ${Number(payload.total ?? 0).toFixed(2)}`;
                    await whatsappService.sendEstimate(customer.phone, total, payload.viewUrl ?? '', companyId);
                }
                break;

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
