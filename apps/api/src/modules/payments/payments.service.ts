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

    createPayFastCheckout: async (token: string) => {
        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: { job: { include: { customer: true } }, company: true },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        if (invoice.status === 'PAID') {
            throw new AppError('Invoice already paid', StatusCodes.BAD_REQUEST);
        }

        const settings = normalizeCompanySettings(invoice.company.settings);
        const payFast = settings.billing.payFast;
        if (!settings.billing.paymentMethods.payFastEnabled) {
            throw new AppError('PayFast is disabled for this company', StatusCodes.BAD_REQUEST);
        }
        if (!payFast.merchantId || !payFast.merchantKey) {
            throw new AppError('PayFast merchant details are not configured', StatusCodes.SERVICE_UNAVAILABLE);
        }

        const amount = Number(invoice.balance).toFixed(2);
        const url = new URL(
            payFast.sandbox
                ? 'https://sandbox.payfast.co.za/eng/process'
                : 'https://www.payfast.co.za/eng/process'
        );
        const params = new URLSearchParams({
            merchant_id: payFast.merchantId,
            merchant_key: payFast.merchantKey,
            return_url: `${config.WEB_URL}/pay/${token}?status=success&method=payfast`,
            cancel_url: `${config.WEB_URL}/pay/${token}?status=cancel&method=payfast`,
            notify_url: `${config.API_URL}/public/payments/payfast/notify`,
            name_first: invoice.job.customer.name,
            email_address: invoice.job.customer.email ?? '',
            m_payment_id: invoice.id,
            amount,
            item_name: invoice.invoiceNumber ?? `Invoice ${invoice.id.slice(0, 8)}`,
        });
        url.search = params.toString();

        await prisma.payment.create({
            data: {
                companyId: invoice.companyId,
                invoiceId: invoice.id,
                amount: invoice.balance,
                method: 'PAYFAST',
                status: 'PENDING',
                metadata: { token, amount } as any,
            },
        });

        return { url: url.toString(), id: invoice.id };
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
        method: 'CARD' | 'ACH' | 'CASH' | 'CHECK' | 'EFT' | 'PAYFAST' | 'OTHER';
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
        method: 'CASH' | 'CHECK' | 'EFT' | 'OTHER';
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

    recordEftPayment: async (params: {
        invoiceId: string;
        companyId: string;
        amount: number;
        reference?: string;
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
            method: 'EFT',
        });
    },

    /**
     * Bulk EFT reconciliation — dry run. Given parsed bank-statement lines
     * (date, amount, reference), match each against the company's OPEN invoices
     * by reference text and/or exact outstanding-balance amount. Nothing is
     * written; the caller reviews/adjusts before confirming via bulkRecordEft.
     *
     * A line is:
     *   - matched   → exactly one confident candidate (reference beats amount).
     *   - ambiguous → more than one candidate; user picks.
     *   - unmatched → no candidate at all.
     */
    bulkMatchEft: async (
        companyId: string,
        lines: { date?: string; amount: number; reference?: string }[]
    ) => {
        const openInvoices = await prisma.invoice.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
                balance: { gt: 0 },
            },
            include: { job: { include: { customer: { select: { name: true } } } } },
        });

        const norm = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const view = (inv: (typeof openInvoices)[number]) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            paymentReference: inv.paymentReference,
            customerName: inv.job?.customer?.name ?? null,
            balance: Number(inv.balance),
            status: inv.status,
        });

        const matched: any[] = [];
        const ambiguous: any[] = [];
        const unmatched: any[] = [];

        lines.forEach((line, index) => {
            const refNorm = norm(line.reference);
            const amount = Number(line.amount);

            // Reference match: an invoice number / payment reference appears in the
            // (normalized) statement narrative. Guard against trivial short tokens.
            const refCandidates = refNorm
                ? openInvoices.filter((inv) => {
                      const num = norm(inv.invoiceNumber);
                      const ref = norm(inv.paymentReference);
                      return (
                          (num.length >= 3 && refNorm.includes(num)) ||
                          (ref.length >= 3 && refNorm.includes(ref))
                      );
                  })
                : [];

            const amountCandidates = openInvoices.filter(
                (inv) => Math.abs(Number(inv.balance) - amount) < 0.005
            );

            if (refCandidates.length === 1) {
                const inv = refCandidates[0];
                matched.push({
                    index,
                    line,
                    invoice: view(inv),
                    confidence: 'reference',
                    amountMismatch: Math.abs(Number(inv.balance) - amount) >= 0.005,
                });
            } else if (refCandidates.length > 1) {
                ambiguous.push({ index, line, reason: 'reference', candidates: refCandidates.map(view) });
            } else if (amountCandidates.length === 1) {
                matched.push({
                    index,
                    line,
                    invoice: view(amountCandidates[0]),
                    confidence: 'amount',
                    amountMismatch: false,
                });
            } else if (amountCandidates.length > 1) {
                ambiguous.push({ index, line, reason: 'amount', candidates: amountCandidates.map(view) });
            } else {
                unmatched.push({ index, line });
            }
        });

        return {
            matched,
            ambiguous,
            unmatched,
            openInvoiceCount: openInvoices.length,
        };
    },

    /**
     * Bulk EFT reconciliation — apply confirmed matches. Each match records an
     * EFT payment against its invoice (reusing the single-payment path, so
     * balance / PAID|PARTIAL transitions and socket emits are identical).
     * Failures are isolated per-match so one bad row never aborts the batch.
     */
    bulkRecordEft: async (
        companyId: string,
        matches: { invoiceId: string; amount: number; reference?: string }[]
    ) => {
        const results: {
            invoiceId: string;
            ok: boolean;
            status?: string;
            amount?: number;
            error?: string;
        }[] = [];

        for (const m of matches) {
            try {
                const invoice = await prisma.invoice.findFirst({
                    where: { id: m.invoiceId, companyId, deletedAt: null },
                });
                if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
                if (invoice.status === 'PAID') throw new AppError('Invoice already paid', StatusCodes.BAD_REQUEST);
                if (invoice.status === 'VOID') throw new AppError('Invoice is void', StatusCodes.BAD_REQUEST);
                if (!(m.amount > 0)) throw new AppError('Amount must be positive', StatusCodes.BAD_REQUEST);

                const { invoice: updated } = await paymentsService._recordPayment({
                    invoiceId: invoice.id,
                    amount: m.amount,
                    paymentIntentId: null,
                    method: 'EFT',
                });
                results.push({ invoiceId: m.invoiceId, ok: true, status: updated.status, amount: m.amount });
            } catch (e: any) {
                results.push({ invoiceId: m.invoiceId, ok: false, error: e?.message ?? 'Failed to record payment' });
            }
        }

        const recorded = results.filter((r) => r.ok).length;
        return { results, recorded, failed: results.length - recorded };
    },

    handlePayFastITN: async (body: Record<string, string>, sourceIp?: string) => {
        const PAYFAST_ALLOWED_CIDRS = [
            '197.97.145.', '41.74.179.', '102.222.168.',
            '197.242.148.', '197.242.149.',
            '127.0.0.1', '::1',
        ];

        if (sourceIp) {
            const allowed = PAYFAST_ALLOWED_CIDRS.some((cidr) => sourceIp.startsWith(cidr));
            if (!allowed) {
                logger.warn({ sourceIp }, 'PayFast ITN: request from untrusted IP');
                return { received: false };
            }
        }

        if (!body.signature) {
            logger.warn('PayFast ITN: missing signature');
            return { received: false };
        }

        const invoiceId = body.m_payment_id;
        if (!invoiceId) {
            logger.warn('PayFast ITN missing m_payment_id');
            return { received: false };
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { company: true },
        });
        if (!invoice) {
            logger.warn({ invoiceId }, 'PayFast ITN: invoice not found');
            return { received: false };
        }

        const settings = normalizeCompanySettings(invoice.company.settings);
        const passphrase = settings.billing.payFast.passphrase;

        const paramString = Object.entries(body)
            .filter(([key]) => key !== 'signature')
            .map(([key, val]) => `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}`)
            .join('&');

        const toHash = passphrase ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : paramString;
        const crypto = await import('crypto');
        const expectedSig = crypto.createHash('md5').update(toHash).digest('hex');

        if (body.signature !== expectedSig) {
            logger.warn({ invoiceId }, 'PayFast ITN: signature mismatch');
            return { received: false };
        }

        const paymentStatus = body.payment_status;
        logger.info({ invoiceId, paymentStatus, pfPaymentId: body.pf_payment_id }, 'PayFast ITN received');

        if (paymentStatus === 'COMPLETE') {
            const amount = parseFloat(body.amount_gross || '0');
            await paymentsService._recordPayment({
                invoiceId,
                amount,
                paymentIntentId: body.pf_payment_id || null,
                method: 'PAYFAST',
            });
        } else if (paymentStatus === 'CANCELLED') {
            await prisma.payment.updateMany({
                where: { invoiceId, method: 'PAYFAST', status: 'PENDING' },
                data: { status: 'FAILED', failureReason: 'Cancelled by user' },
            });
        }

        return { received: true };
    },
};
