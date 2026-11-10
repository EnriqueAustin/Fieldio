import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { stripeService, isStripeConfigured } from '../../services/stripe.service';
import { config } from '../../config/env';
import { socketService } from '../../services/socket.service';
import { logger } from '../../utils/logger';
import { normalizeCompanySettings, type CompanySettings } from '../company/company-settings';

type PaymentMethodName = 'CARD' | 'ACH' | 'CASH' | 'CHECK' | 'EFT' | 'PAYFAST' | 'OTHER';

const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const fromCents = (cents: number) => cents / 100;

/** Thrown when a gateway notification refers to a payment that is already recorded. */
export class DuplicatePaymentError extends Error {
    constructor() {
        super('Payment already recorded');
    }
}

// Another writer changed the invoice balance between our read and our write.
class BalanceConflictError extends Error {}

const isUniqueViolation = (e: any) => e?.code === 'P2002';

// PayFast ITN source addresses (www/sandbox/w1w/w2w.payfast.co.za ranges).
const PAYFAST_IP_PREFIXES = ['197.97.145.', '41.74.179.', '102.222.168.', '197.242.148.', '197.242.149.'];
const LOOPBACK_IPS = ['127.0.0.1', '::1'];

export const isPayFastSourceIp = (ip: string | undefined | null) => {
    if (!ip) return false;
    const normalized = ip.replace(/^::ffff:/i, '');
    if (PAYFAST_IP_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
    // Loopback is only trusted for local development / tests, never in production.
    return config.NODE_ENV !== 'production' && LOOPBACK_IPS.includes(normalized);
};

// PayFast's documented encoding: encodeURIComponent with spaces as '+'.
const pfEncode = (value: unknown) => encodeURIComponent(String(value ?? '').trim()).replace(/%20/g, '+');

const md5 = (value: string) => crypto.createHash('md5').update(value).digest('hex');

const safeEqual = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
};

/**
 * Outbound PayFast calls, kept on an object so tests can replace them.
 * `validate` performs the server-to-server ITN confirmation and returns
 * PayFast's response body ("VALID" / "INVALID").
 */
export const payFastClient = {
    validate: async (paramString: string, sandbox: boolean): Promise<string> => {
        const host = sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
        const res = await fetch(`https://${host}/eng/query/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: paramString,
            signal: AbortSignal.timeout(10_000),
        });
        return (await res.text()).trim();
    },
};

const isPayFastReady = (settings: CompanySettings) => {
    const pf = settings.billing.payFast;
    return Boolean(
        settings.billing.paymentMethods.payFastEnabled && pf.merchantId && pf.merchantKey && pf.passphrase
    );
};

const eftReference = (
    invoice: { id: string; invoiceNumber: string | null; paymentReference: string | null },
    settings: CompanySettings
) => {
    if (invoice.paymentReference) return invoice.paymentReference;
    if (invoice.invoiceNumber) return invoice.invoiceNumber;
    const short = invoice.id.slice(0, 8).toUpperCase();
    const prefix = settings.billing.eftDetails.referencePrefix;
    return prefix ? `${prefix}-${short}` : short;
};

/**
 * Explicit whitelist of what the customer-facing pay page may see. Company
 * settings hold gateway secrets (PayFast merchant key / passphrase) and
 * internal config, so they must never be returned wholesale.
 */
const toPublicInvoice = (invoice: any) => {
    const settings = normalizeCompanySettings(invoice.company?.settings);
    const methods = settings.billing.paymentMethods;
    const eft = settings.billing.eftDetails;
    const property = invoice.job?.property;
    const lines = Array.isArray(invoice.items) ? invoice.items : [];

    return {
        id: invoice.id as string,
        invoiceNumber: (invoice.invoiceNumber ?? null) as string | null,
        heading: settings.billing.invoiceHeading,
        status: invoice.status as string,
        issuedAt: invoice.createdAt ?? null,
        dueDate: invoice.dueDate ?? null,
        paidAt: invoice.paidAt ?? null,
        jobTitle: (invoice.job?.title ?? null) as string | null,
        items: lines.map((line: any) => ({
            name: String(line?.name ?? ''),
            description: line?.description ?? null,
            quantity: Number(line?.quantity ?? 0),
            unitPrice: Number(line?.unitPrice ?? 0),
            total: Number(line?.total ?? 0),
        })),
        subtotal: Number(invoice.subtotal ?? 0),
        tax: Number(invoice.tax ?? 0),
        total: Number(invoice.total ?? 0),
        balance: Number(invoice.balance ?? 0),
        taxLabel: (invoice.taxLabel ?? settings.billing.taxLabel) as string,
        taxRate: Number(invoice.taxRate ?? settings.billing.taxRate),
        company: {
            name: (invoice.supplierName || invoice.company?.name || '') as string,
            registrationNumber: (invoice.supplierCompanyRegistration ||
                settings.billing.companyRegistrationNumber ||
                null) as string | null,
            vatNumber: (invoice.taxNumber || settings.billing.taxNumber || null) as string | null,
            phone: settings.contact.phone ?? null,
            email: settings.contact.email ?? null,
            website: settings.contact.website ?? null,
            currency: settings.regional.currency,
            locale: settings.regional.locale,
        },
        customer: { name: (invoice.job?.customer?.name ?? null) as string | null },
        property: property
            ? {
                  addressLine1: property.addressLine1 ?? null,
                  addressLine2: property.addressLine2 ?? null,
                  city: property.city ?? null,
                  state: property.state ?? null,
                  zip: property.zip ?? null,
              }
            : null,
        paymentOptions: {
            // Stripe is only offered when the server actually has it configured.
            card: Boolean(methods.cardEnabled && isStripeConfigured()),
            payFast: isPayFastReady(settings),
            eft: methods.eftEnabled
                ? {
                      bankName: eft.bankName ?? null,
                      accountName: eft.accountName ?? null,
                      accountNumber: eft.accountNumber ?? null,
                      branchCode: eft.branchCode ?? null,
                      accountType: eft.accountType ?? null,
                      reference: eftReference(invoice, settings),
                      instructions: eft.paymentInstructions || null,
                  }
                : null,
        },
        payments: (Array.isArray(invoice.payments) ? invoice.payments : [])
            .filter((p: any) => p.status === 'SUCCEEDED' || p.status === 'REFUNDED')
            .map((p: any) => ({
                amount: Number(p.amount ?? 0),
                method: p.method as string,
                date: p.createdAt ?? null,
                status: p.status as string,
            })),
    };
};

export type PublicInvoice = ReturnType<typeof toPublicInvoice>;

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
    getPublicInvoice: async (token: string): Promise<PublicInvoice> => {
        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: {
                // settings are read server-side only; toPublicInvoice whitelists the output.
                company: { select: { id: true, name: true, settings: true } },
                job: {
                    select: {
                        title: true,
                        customer: { select: { name: true } },
                        property: true,
                    },
                },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!invoice || invoice.deletedAt) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        return toPublicInvoice(invoice);
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
        // The ITN handler rejects notifications without a passphrase-signed payload,
        // so never send a customer to PayFast if we couldn't accept the result.
        if (!payFast.merchantId || !payFast.merchantKey || !payFast.passphrase) {
            throw new AppError('PayFast merchant details are not configured', StatusCodes.SERVICE_UNAVAILABLE);
        }
        if (!(toCents(invoice.balance) > 0)) {
            throw new AppError('Nothing is owing on this invoice', StatusCodes.BAD_REQUEST);
        }

        const amount = fromCents(toCents(invoice.balance)).toFixed(2);

        // The PENDING row's id is the m_payment_id, so the ITN resolves exactly
        // this attempt (and its expected amount) rather than "some" pending row.
        const pending = await prisma.payment.create({
            data: {
                companyId: invoice.companyId,
                invoiceId: invoice.id,
                amount,
                method: 'PAYFAST',
                status: 'PENDING',
                metadata: { token, amount } as any,
            },
        });

        // Field order follows PayFast's documented order; it matters for the signature.
        const fields: [string, string][] = [
            ['merchant_id', payFast.merchantId],
            ['merchant_key', payFast.merchantKey],
            ['return_url', `${config.WEB_URL}/pay/${token}?status=success&method=payfast`],
            ['cancel_url', `${config.WEB_URL}/pay/${token}?status=cancel&method=payfast`],
            ['notify_url', `${config.API_URL}/public/payments/payfast/notify`],
            ['name_first', invoice.job.customer.name],
            ['email_address', invoice.job.customer.email ?? ''],
            ['m_payment_id', pending.id],
            ['amount', amount],
            ['item_name', invoice.invoiceNumber ?? `Invoice ${invoice.id.slice(0, 8)}`],
            ['custom_str1', invoice.id],
        ];
        const paramString = fields
            .filter(([, value]) => String(value ?? '').trim() !== '')
            .map(([key, value]) => `${key}=${pfEncode(value)}`)
            .join('&');
        const signature = md5(`${paramString}&passphrase=${pfEncode(payFast.passphrase)}`);

        const base = payFast.sandbox
            ? 'https://sandbox.payfast.co.za/eng/process'
            : 'https://www.payfast.co.za/eng/process';

        return { url: `${base}?${paramString}&signature=${signature}`, id: invoice.id };
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
                // Async methods complete the session before funds clear.
                if (session.payment_status && session.payment_status !== 'paid') break;
                if (!(Number(session.amount_total) > 0)) break;
                const paymentIntentId = (session.payment_intent as string | null) ?? (session.id as string);
                // Stripe retries webhooks: a replay must be acknowledged, not recorded twice.
                const existing = await prisma.payment.findFirst({
                    where: { stripePaymentIntentId: paymentIntentId },
                });
                if (existing) {
                    logger.info({ invoiceId, paymentIntentId }, 'Stripe webhook: payment already recorded');
                    break;
                }
                try {
                    await paymentsService._recordPayment({
                        invoiceId,
                        amount: (session.amount_total ?? 0) / 100,
                        paymentIntentId,
                        method: 'CARD',
                    });
                } catch (e) {
                    if (!(e instanceof DuplicatePaymentError)) throw e;
                }
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

    /**
     * Records a successful payment and reduces the invoice balance.
     *
     * Race-safe: the balance write is conditional on the balance we read
     * (optimistic concurrency). A concurrent payment makes it match zero rows,
     * the transaction rolls back and we retry against the fresh balance.
     *
     * The full amount is always recorded on the Payment; the balance is clamped
     * at 0 and any excess is returned as `overpayment` (also kept in the
     * payment's metadata) so the office can refund or credit it.
     *
     * With `pendingPaymentId` the existing PENDING row is promoted instead of a
     * new row created; if it is no longer PENDING a DuplicatePaymentError is thrown.
     */
    _recordPayment: async (params: {
        invoiceId: string;
        amount: number;
        paymentIntentId: string | null;
        method: PaymentMethodName;
        pendingPaymentId?: string;
        metadata?: Record<string, unknown>;
    }) => {
        const amountCents = toCents(params.amount);
        if (!(amountCents > 0)) throw new AppError('Amount must be positive', StatusCodes.BAD_REQUEST);

        const MAX_ATTEMPTS = 5;
        let result!: { payment: any; invoice: any; overpayment: number };
        for (let attempt = 1; ; attempt++) {
            try {
                result = await prisma.$transaction(async (tx) => {
                    const invoice = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
                    if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);

                    const balanceCents = Math.max(0, toCents(invoice.balance));
                    const newBalanceCents = Math.max(0, balanceCents - amountCents);
                    const overpaymentCents = Math.max(0, amountCents - balanceCents);
                    const fullyPaid = newBalanceCents === 0;

                    const metadata: Record<string, unknown> = { ...(params.metadata ?? {}) };
                    if (overpaymentCents > 0) metadata.overpayment = fromCents(overpaymentCents);
                    const paymentData = {
                        amount: fromCents(amountCents),
                        status: 'SUCCEEDED' as const,
                        stripePaymentIntentId: params.paymentIntentId,
                    };

                    let payment: any;
                    if (params.pendingPaymentId) {
                        const pending = await tx.payment.findFirst({
                            where: { id: params.pendingPaymentId, invoiceId: invoice.id },
                        });
                        const promoted = await tx.payment.updateMany({
                            where: { id: params.pendingPaymentId, invoiceId: invoice.id, status: 'PENDING' },
                            data: {
                                ...paymentData,
                                metadata: { ...((pending?.metadata as any) ?? {}), ...metadata } as any,
                            },
                        });
                        if (promoted.count === 0) throw new DuplicatePaymentError();
                        payment = await tx.payment.findFirst({ where: { id: params.pendingPaymentId } });
                    } else {
                        payment = await tx.payment.create({
                            data: {
                                companyId: invoice.companyId,
                                invoiceId: invoice.id,
                                method: params.method,
                                ...paymentData,
                                metadata: Object.keys(metadata).length ? (metadata as any) : undefined,
                            },
                        });
                    }

                    // Conditional on the balance we read — never overwrite a concurrent write.
                    const written = await tx.invoice.updateMany({
                        where: { id: invoice.id, balance: invoice.balance },
                        data: {
                            balance: fromCents(newBalanceCents),
                            status: fullyPaid ? 'PAID' : 'PARTIAL',
                            paidAt: fullyPaid ? invoice.paidAt ?? new Date() : invoice.paidAt,
                            stripePaymentId: params.paymentIntentId ?? invoice.stripePaymentId,
                        },
                    });
                    if (written.count === 0) throw new BalanceConflictError();

                    const updated = await tx.invoice.findUnique({ where: { id: invoice.id } });
                    return { payment, invoice: updated!, overpayment: fromCents(overpaymentCents) };
                });
                break;
            } catch (e) {
                if (e instanceof BalanceConflictError && attempt < MAX_ATTEMPTS) continue;
                if (e instanceof BalanceConflictError) {
                    throw new AppError('Invoice is being updated, please retry', StatusCodes.CONFLICT);
                }
                // A concurrent duplicate gateway notification lost the unique race.
                if (isUniqueViolation(e) && params.paymentIntentId) throw new DuplicatePaymentError();
                throw e;
            }
        }

        if (result.overpayment > 0) {
            logger.warn(
                { invoiceId: result.invoice.id, paymentId: result.payment?.id, overpayment: result.overpayment },
                'Payment exceeds invoice balance; excess recorded as overpayment'
            );
        }

        socketService.emitToCompany(result.invoice.companyId, 'invoice:paid', {
            invoiceId: result.invoice.id,
            balance: result.invoice.balance,
            status: result.invoice.status,
            overpayment: result.overpayment,
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
        reference?: string;
        note?: string;
    }) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id: params.invoiceId, companyId: params.companyId },
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        const metadata = {
            ...(params.reference ? { reference: params.reference } : {}),
            ...(params.note ? { note: params.note } : {}),
        };
        return paymentsService._recordPayment({
            invoiceId: invoice.id,
            amount: params.amount,
            paymentIntentId: null,
            method: params.method,
            metadata: Object.keys(metadata).length ? metadata : undefined,
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
            metadata: {
                ...(params.reference ? { reference: params.reference } : {}),
                ...(params.note ? { note: params.note } : {}),
            },
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
                    metadata: m.reference ? { reference: m.reference, source: 'bulk-eft' } : { source: 'bulk-eft' },
                });
                results.push({ invoiceId: m.invoiceId, ok: true, status: updated.status, amount: m.amount });
            } catch (e: any) {
                results.push({ invoiceId: m.invoiceId, ok: false, error: e?.message ?? 'Failed to record payment' });
            }
        }

        const recorded = results.filter((r) => r.ok).length;
        return { results, recorded, failed: results.length - recorded };
    },

    /**
     * PayFast ITN (instant transaction notification). Follows PayFast's four
     * security checks — source IP, signature (passphrase required), amount and
     * server-to-server validation — before anything is recorded.
     *
     * `received: false` → 400 (PayFast retries); duplicates of an already
     * recorded payment are acknowledged (`received: true`) without re-recording.
     */
    handlePayFastITN: async (
        rawBody: Record<string, unknown>,
        sourceIp?: string
    ): Promise<{ received: boolean; duplicate?: boolean }> => {
        const reject = (reason: string, ctx: Record<string, unknown> = {}) => {
            logger.warn({ ...ctx, sourceIp }, `PayFast ITN rejected: ${reason}`);
            return { received: false };
        };

        if (!isPayFastSourceIp(sourceIp)) return reject('untrusted source IP');

        const body: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawBody ?? {})) {
            if (typeof value === 'string') body[key] = value;
        }
        if (!body.signature) return reject('missing signature');
        const mPaymentId = body.m_payment_id;
        if (!mPaymentId) return reject('missing m_payment_id');

        // New checkouts send the PENDING payment's id; older ones sent the invoice id.
        const pending = await prisma.payment.findFirst({ where: { id: mPaymentId, method: 'PAYFAST' } });
        const invoiceId = pending?.invoiceId ?? mPaymentId;

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { company: true },
        });
        if (!invoice) return reject('invoice not found', { mPaymentId });

        const settings = normalizeCompanySettings(invoice.company.settings);
        const payFast = settings.billing.payFast;
        if (!payFast.passphrase) {
            return reject('company has no PayFast passphrase configured', { invoiceId });
        }
        if (payFast.merchantId && body.merchant_id !== payFast.merchantId) {
            return reject('merchant_id mismatch', { invoiceId });
        }

        const paramString = Object.entries(body)
            .filter(([key]) => key !== 'signature')
            .map(([key, val]) => `${key}=${pfEncode(val)}`)
            .join('&');
        const expectedSig = md5(`${paramString}&passphrase=${pfEncode(payFast.passphrase)}`);
        if (!safeEqual(body.signature.toLowerCase(), expectedSig)) {
            return reject('signature mismatch', { invoiceId });
        }

        const paymentStatus = body.payment_status;
        const pfPaymentId = body.pf_payment_id || null;
        logger.info({ invoiceId, paymentStatus, pfPaymentId }, 'PayFast ITN received');

        // Idempotency: PayFast retries until it gets a 200.
        if (pending && pending.status !== 'PENDING') {
            return { received: true, duplicate: true };
        }
        if (pfPaymentId) {
            const existing = await prisma.payment.findFirst({ where: { stripePaymentIntentId: pfPaymentId } });
            if (existing) return { received: true, duplicate: true };
        }

        // Legacy notifications (m_payment_id = invoice id): use the latest pending attempt.
        const attempt =
            pending ??
            (
                await prisma.payment.findMany({
                    where: { invoiceId: invoice.id, method: 'PAYFAST', status: 'PENDING' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                })
            )[0] ??
            null;

        if (paymentStatus === 'COMPLETE') {
            const expectedCents = toCents(attempt ? attempt.amount : invoice.balance);
            const grossCents = toCents(body.amount_gross);
            if (!body.amount_gross || grossCents !== expectedCents) {
                return reject('amount mismatch', {
                    invoiceId,
                    amountGross: body.amount_gross,
                    expected: fromCents(expectedCents),
                });
            }
        }

        let validation: string;
        try {
            validation = await payFastClient.validate(paramString, payFast.sandbox);
        } catch (err: any) {
            return reject('validation request failed', { invoiceId, err: err?.message });
        }
        if (validation !== 'VALID') return reject('PayFast validation returned INVALID', { invoiceId, validation });

        if (paymentStatus === 'COMPLETE') {
            try {
                await paymentsService._recordPayment({
                    invoiceId: invoice.id,
                    amount: fromCents(toCents(body.amount_gross)),
                    paymentIntentId: pfPaymentId,
                    method: 'PAYFAST',
                    pendingPaymentId: attempt?.id,
                    metadata: {
                        pfPaymentId,
                        amountFee: body.amount_fee ?? null,
                        amountNet: body.amount_net ?? null,
                    },
                });
            } catch (e) {
                if (e instanceof DuplicatePaymentError) return { received: true, duplicate: true };
                throw e;
            }
        } else if (paymentStatus === 'CANCELLED') {
            await prisma.payment.updateMany({
                where: attempt
                    ? { id: attempt.id, status: 'PENDING' }
                    : { invoiceId: invoice.id, method: 'PAYFAST', status: 'PENDING' },
                data: { status: 'FAILED', failureReason: 'Cancelled by user' },
            });
        }

        return { received: true };
    },
};
