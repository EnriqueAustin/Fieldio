import { prisma } from '@fieldio/database';
import { socketService } from '../socket.service';
import { emailService } from './email.service';
import { smsService } from './sms.service';
import { paymentsService } from '../../modules/payments/payments.service';

type InternalType = 'JOB_ASSIGNED' | 'MENTION' | 'ALERT' | 'SYSTEM';
type CustomerType =
    | 'JOB_EN_ROUTE'
    | 'JOB_STARTED'
    | 'JOB_COMPLETED'
    | 'INVOICE_SENT'
    | 'PAYMENT_RECEIPT'
    | 'APPOINTMENT_REMINDER'
    | 'ESTIMATE_SENT';

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
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId },
        });
        if (!customer) return;

        switch (type) {
            case 'JOB_EN_ROUTE':
                if (customer.phone)
                    await smsService.sendJobEnRoute(
                        customer.phone,
                        payload.techName ?? 'Your technician',
                        payload.eta,
                        companyId
                    );
                break;

            case 'JOB_STARTED':
                if (customer.phone)
                    await smsService.sendJobStarted(
                        customer.phone,
                        payload.techName ?? 'Your technician',
                        companyId
                    );
                break;

            case 'JOB_COMPLETED':
                if (customer.phone)
                    await smsService.sendJobCompleted(
                        customer.phone,
                        payload.jobTitle ?? 'Service',
                        companyId
                    );
                break;

            case 'INVOICE_SENT':
                if (customer.email && payload.invoiceId) {
                    const payUrl = await paymentsService.getPayLinkForInvoice(
                        payload.invoiceId,
                        companyId
                    );
                    await emailService.sendInvoice(
                        customer.email,
                        { id: payload.invoiceId, total: payload.total ?? 0, payUrl },
                        companyId
                    );
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
                if (customer.phone)
                    await smsService.sendAppointmentReminder(
                        customer.phone,
                        payload.when,
                        companyId
                    );
                break;

            case 'ESTIMATE_SENT':
                if (customer.email)
                    await emailService.sendEstimate(
                        customer.email,
                        {
                            id: payload.estimateId,
                            total: payload.total ?? 0,
                            viewUrl: payload.viewUrl ?? '',
                        },
                        companyId
                    );
                break;
        }
    },
};
