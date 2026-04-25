import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { stripeService, isStripeConfigured } from '../../services/stripe.service';
import { config } from '../../config/env';
import { socketService } from '../../services/socket.service';
import { logger } from '../../utils/logger';
import { normalizeCompanySettings } from '../company/company-settings';

const ensureToken = async (invoiceId: string) => {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
    if (inv.publicToken) return inv.publicToken;
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.invoice.update({ where: { id: invoiceId }, data: { publicToken: token } });
    return token;
};

export const paymentsService = {
    /**
     * Get an invoice via its public token (no auth) — used by customer-facing pay page.
     */
    getPublicInvoice: async (token: string) => {
        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: {
                company: { select: { id: true, name: true, settings: true } },
                job: {
                    include: {
                        customer: { select: { name: true, email: true } },
                        property: true,
                    },
                },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        return invoice;
    },

    getPayLinkForInvoice: async (invoiceId: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        const token = await ensureToken(invoice.id);
        return `${config.WEB_URL}/pay/${token}`;
    },

    createCheckoutSession: async (token: string) => {
        if (!isStripeConfigured()) {
            throw new AppError('Payments are not configured on this server', StatusCodes.SERVICE_UNAVAILABLE);
        }
        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: { job: { include: { customer: true } }, company: true },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        if (invoice.status === 'PAID') {
            throw new AppError('Invoice already paid', StatusCodes.BAD_REQUEST);
        }
        const settings = normalizeCompanySettings(invoice.company.settings);
        if (!settings.billing.paymentMethods.cardEnabled) {
            throw new AppError('Card payments are disabled for this company', StatusCodes.BAD_REQUEST);
        }

        const session = await stripeService.createInvoiceCheckout({
            invoiceId: invoice.id,
            amount: Number(invoice.balance),
            currency: settings.regional.currency,
            description: `Invoice for ${invoice.job.customer.name}`,
            customerEmail: invoice.job.customer.email ?? undefined,
            successUrl: `${config.WEB_URL}/pay/${token}?status=success`,
            cancelUrl: `${config.WEB_URL}/pay/${token}?status=cancel`,
        });

        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { stripeCheckoutSessionId: session.id },
        });

        return { url: session.url, id: session.id };
    },

    /**
     * Stripe webhook entry point. The raw body is required.
     */
    handleStripeWebhook: async (rawBody: Buffer, signature: string) => {
        const event = stripeService.constructWebhookEvent(rawBody, signature);
        logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as any;
                const invoiceId = session.metadata?.invoiceId as string | undefined;
                if (!invoiceId) break;
                await paymentsService._recordPayment({
                    invoiceId,
                    amount: (session.amount_total ?? 0) / 100,
                    paymentIntentId: session.payment_intent as string | null,
                    method: 'CARD',
                });
                break;
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object as any;
                const invoiceId = intent.metadata?.invoiceId as string | undefined;
                if (!invoiceId) break;
                await prisma.payment.updateMany({
                    where: { stripePaymentIntentId: intent.id },
                    data: {
                        status: 'FAILED',
                        failureReason: intent.last_payment_error?.message ?? 'Unknown',
                    },
                });
                break;
            }
            default:
                logger.debug({ type: event.type }, 'Unhandled Stripe event');
        }
        return { received: true };
    },

    _recordPayment: async (params: {
        invoiceId: string;
        amount: number;
        paymentIntentId: string | null;
        method: 'CARD' | 'ACH' | 'CASH' | 'CHECK' | 'OTHER';
    }) => {
        const result = await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
            if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);

            const payment = await tx.payment.create({
                data: {
                    companyId: invoice.companyId,
                    invoiceId: invoice.id,
                    amount: params.amount,
                    method: params.method,
                    status: 'SUCCEEDED',
                    stripePaymentIntentId: params.paymentIntentId,
                },
            });

            const newBalance = Math.max(0, Number(invoice.balance) - params.amount);
            const fullyPaid = newBalance <= 0;

            const updated = await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    balance: newBalance,
                    status: fullyPaid ? 'PAID' : 'PARTIAL',
                    paidAt: fullyPaid ? new Date() : invoice.paidAt,
                    stripePaymentId: params.paymentIntentId ?? invoice.stripePaymentId,
                },
            });

            return { payment, invoice: updated };
        });

        socketService.emitToCompany(result.invoice.companyId, 'invoice:paid', {
            invoiceId: result.invoice.id,
            balance: result.invoice.balance,
            status: result.invoice.status,
        });

        return result;
    },

    /**
     * Manual payment (cash / check / external) entered by office staff.
     */
    recordManualPayment: async (params: {
        invoiceId: string;
        companyId: string;
        amount: number;
        method: 'CASH' | 'CHECK' | 'OTHER';
        note?: string;
    }) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id: params.invoiceId, companyId: params.companyId },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        return paymentsService._recordPayment({
            invoiceId: invoice.id,
            amount: params.amount,
            paymentIntentId: null,
            method: params.method,
        });
    },
};
