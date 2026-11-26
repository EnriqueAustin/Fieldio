import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { config } from '../../config/env';
import { notificationService } from '../../services/notifications/notification.service';
import { jobPushLink } from '../../utils/push-link';
import { socketService } from '../../services/socket.service';
import { normalizeCompanySettings } from '../company/company-settings';
import { computeMonthlyPayment } from '../financing/financing.service';
import {
    BUSY_STATUSES,
    checkEligibility,
    computeSlots,
    jobDurationMinutes,
    type RescheduleRules,
    type Slot,
} from './portal-reschedule';

const RESCHEDULE_EVENT = 'CUSTOMER_RESCHEDULED';

interface FinancingOffer {
    optionId: string;
    name: string;
    termMonths: number;
    interestRate: number;
    monthlyPayment: number;
}

const RESCHEDULE_REFUSALS: Record<string, string> = {
    DISABLED: 'Online rescheduling is not available. Please contact us to change your booking.',
    STATUS: 'This job can no longer be moved online. Please contact us.',
    NOT_SCHEDULED: 'This job has no booked time yet. We will be in touch to schedule it.',
    TOO_LATE: 'This appointment is too close to move online. Please contact us.',
    LIMIT_REACHED: 'This appointment has already been moved online. Please contact us to change it again.',
};

interface RescheduleContext {
    companyId: string;
    customer: { name: string };
    job: {
        id: string;
        title: string;
        status: string;
        techId: string | null;
        scheduledStart: Date | null;
        scheduledEnd: Date | null;
    };
    rules: RescheduleRules;
    timeZone: string;
    contactPhone: string | null;
    prior: number;
}

function formatWhen(date: Date | null, timeZone: string) {
    if (!date) return 'no set time';
    return new Intl.DateTimeFormat('en-ZA', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export const portalService = {
    generatePortalLink: async (customerId: string, companyId: string) => {
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId, deletedAt: null },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await prisma.customerPortalToken.create({
            data: { companyId, customerId, token, expiresAt },
        });

        return { url: `${config.WEB_URL}/portal/${token}`, token, expiresAt };
    },

    validateToken: async (token: string) => {
        const record = await prisma.customerPortalToken.findUnique({
            where: { token },
            include: { customer: true },
        });

        if (!record) throw new AppError('Invalid portal link', StatusCodes.NOT_FOUND);
        if (record.expiresAt < new Date()) throw new AppError('Portal link expired', StatusCodes.GONE);

        return { customerId: record.customerId, companyId: record.companyId, customer: record.customer };
    },

    getPortalDashboard: async (token: string) => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);

        const [company, jobs, estimates, invoices] = await Promise.all([
            prisma.company.findFirst({ where: { id: companyId }, select: { name: true, settings: true } }),
            prisma.job.findMany({
                where: { customerId, companyId, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: 20,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    scheduledStart: true,
                    scheduledEnd: true,
                    actualStart: true,
                    actualEnd: true,
                    createdAt: true,
                    property: { select: { addressLine1: true, city: true } },
                    tech: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.estimate.findMany({
                where: { customerId, companyId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    status: true,
                    subtotal: true,
                    tax: true,
                    taxRate: true,
                    taxLabel: true,
                    total: true,
                    validUntil: true,
                    createdAt: true,
                    items: true,
                },
            }),
            prisma.invoice.findMany({
                where: { job: { customerId, companyId }, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                    total: true,
                    balance: true,
                    dueDate: true,
                    paidAt: true,
                    publicToken: true,
                    createdAt: true,
                },
            }),
        ]);

        const settings = normalizeCompanySettings(company?.settings);
        const offers = await portalService.financingOffersFor(companyId, settings, estimates);
        const applications = estimates.length
            ? await prisma.financingApplication.findMany({
                  where: { companyId, customerId, estimateId: { in: estimates.map((e) => e.id) } },
                  select: { estimateId: true, status: true, monthlyPayment: true, financingOptionId: true },
              })
            : [];

        const now = new Date();
        const rules = settings.portal.selfReschedule;

        return {
            company: { name: company?.name ?? null, phone: settings.contact.phone ?? null },
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
            },
            // The per-job reschedule limit is checked when slots are requested;
            // this flag only decides whether to offer the button at all.
            jobs: jobs.map((j) => ({ ...j, canReschedule: checkEligibility(j, rules, 0, now) === null })),
            estimates: estimates.map((e) => ({
                ...e,
                financingOffers: e.status === 'SENT' ? offers(Number(e.total)) : [],
                financingApplication:
                    applications.find((a) => a.estimateId === e.id && a.status !== 'DECLINED') ?? null,
            })),
            invoices,
        };
    },

    /**
     * Returns a function mapping a quote total to the plans it qualifies for.
     * Empty when the company hasn't switched financing on for quotes.
     */
    financingOffersFor: async (
        companyId: string,
        settings: ReturnType<typeof normalizeCompanySettings>,
        estimates: unknown[]
    ) => {
        if (!settings.financing.enabled || !settings.financing.showOnEstimates || estimates.length === 0) {
            return (_amount: number) => [] as FinancingOffer[];
        }
        const options = await prisma.financingOption.findMany({
            where: { companyId, active: true },
            orderBy: { termMonths: 'asc' },
        });
        return (amount: number): FinancingOffer[] =>
            options
                .filter((o) => amount > 0 && amount >= Number(o.minAmount ?? 0))
                .filter((o) => o.maxAmount == null || amount <= Number(o.maxAmount))
                .map((o) => ({
                    optionId: o.id,
                    name: o.name,
                    termMonths: o.termMonths,
                    interestRate: o.interestRate,
                    monthlyPayment: computeMonthlyPayment(amount, o.interestRate, o.termMonths),
                }));
    },

    /** Customer asks to pay a quote off monthly. Creates (or returns) the office's application. */
    requestFinancing: async (token: string, estimateId: string, financingOptionId: string) => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);

        const [company, estimate] = await Promise.all([
            prisma.company.findFirst({ where: { id: companyId }, select: { settings: true } }),
            prisma.estimate.findFirst({ where: { id: estimateId, customerId, companyId } }),
        ]);
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (!['SENT', 'APPROVED'].includes(estimate.status)) {
            throw new AppError('Financing is not available for this quote', StatusCodes.BAD_REQUEST);
        }

        const settings = normalizeCompanySettings(company?.settings);
        const offers = (await portalService.financingOffersFor(companyId, settings, [estimate]))(Number(estimate.total));
        const offer = offers.find((o) => o.optionId === financingOptionId);
        if (!offer) throw new AppError('That payment plan is not available for this quote', StatusCodes.BAD_REQUEST);

        // One live application per quote: a double tap or a second visit returns it.
        const existing = await prisma.financingApplication.findFirst({
            where: { companyId, customerId, estimateId, status: { notIn: ['DECLINED'] } },
        });
        if (existing) return existing;

        const application = await prisma.financingApplication.create({
            data: {
                companyId,
                customerId,
                estimateId,
                financingOptionId,
                amount: Number(estimate.total),
                monthlyPayment: offer.monthlyPayment,
                status: 'APPLIED',
                notes: 'Requested by the customer from the portal.',
            },
        });

        try {
            await notificationService.notifyStaff(
                companyId,
                'Finance requested',
                `${customer.name} wants to pay quote #${estimateId.slice(0, 8)} over ${offer.termMonths} months (${offer.name}).`
            );
        } catch {
            /* non-blocking */
        }

        return application;
    },

    /** Loads a job the token's customer owns, plus the company's reschedule rules. */
    loadReschedulable: async (token: string, jobId: string): Promise<RescheduleContext> => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);
        const [company, job] = await Promise.all([
            prisma.company.findFirst({ where: { id: companyId }, select: { settings: true } }),
            prisma.job.findFirst({
                where: { id: jobId, customerId, companyId, deletedAt: null },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    techId: true,
                    scheduledStart: true,
                    scheduledEnd: true,
                },
            }),
        ]);
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const settings = normalizeCompanySettings(company?.settings);
        const prior = await prisma.jobTimelineEvent.count({ where: { jobId, type: RESCHEDULE_EVENT } });
        return {
            companyId,
            customer,
            job,
            rules: settings.portal.selfReschedule,
            timeZone: settings.regional.timezone,
            contactPhone: settings.contact.phone ?? null,
            prior,
        };
    },

    openSlotsFor: async (ctx: RescheduleContext, now: Date): Promise<Slot[]> => {
        const { job, rules, timeZone, companyId } = ctx;
        let busy: Slot[] = [];
        if (job.techId) {
            const horizonEnd = new Date(now.getTime() + (rules.horizonDays + 1) * 86400_000);
            const others = await prisma.job.findMany({
                where: {
                    companyId,
                    techId: job.techId,
                    deletedAt: null,
                    id: { not: job.id },
                    status: { in: [...BUSY_STATUSES] },
                    scheduledStart: { lt: horizonEnd },
                },
                select: { scheduledStart: true, scheduledEnd: true, status: true },
            });
            busy = others
                .filter((o) => o.scheduledStart)
                .map((o) => ({
                    start: o.scheduledStart as Date,
                    end: o.scheduledEnd ?? new Date((o.scheduledStart as Date).getTime() + jobDurationMinutes(o) * 60000),
                }))
                .filter((b) => b.end.getTime() > now.getTime());
        }
        return computeSlots({ job, rules, timeZone, busy, now });
    },

    getRescheduleOptions: async (token: string, jobId: string) => {
        const ctx = await portalService.loadReschedulable(token, jobId);
        const now = new Date();
        const reason = checkEligibility(ctx.job, ctx.rules, ctx.prior, now);
        const slots = reason ? [] : await portalService.openSlotsFor(ctx, now);
        return {
            eligible: reason === null,
            reason,
            contactPhone: ctx.contactPhone,
            timeZone: ctx.timeZone,
            current: { start: ctx.job.scheduledStart, end: ctx.job.scheduledEnd },
            durationMinutes: jobDurationMinutes(ctx.job),
            slots,
        };
    },

    rescheduleJob: async (token: string, jobId: string, requestedStart: Date) => {
        const ctx = await portalService.loadReschedulable(token, jobId);
        const now = new Date();
        const reason = checkEligibility(ctx.job, ctx.rules, ctx.prior, now);
        if (reason) {
            throw new AppError(RESCHEDULE_REFUSALS[reason], StatusCodes.CONFLICT);
        }

        // The customer can only land on a slot we'd offer right now, so the
        // server — not the browser — decides business hours and conflicts.
        const slots = await portalService.openSlotsFor(ctx, now);
        const slot = slots.find((s) => s.start.getTime() === requestedStart.getTime());
        if (!slot) throw new AppError('That time is no longer available. Please pick another.', StatusCodes.CONFLICT);

        const previousStart = ctx.job.scheduledStart;
        const updated = await prisma.job.update({
            where: { id: jobId },
            data: { scheduledStart: slot.start, scheduledEnd: slot.end },
            select: { id: true, title: true, status: true, scheduledStart: true, scheduledEnd: true, techId: true },
        });

        await prisma.jobTimelineEvent.create({
            data: {
                companyId: ctx.companyId,
                jobId,
                type: RESCHEDULE_EVENT,
                message: `${ctx.customer.name} moved the appointment from ${formatWhen(previousStart, ctx.timeZone)} to ${formatWhen(slot.start, ctx.timeZone)} via the customer portal.`,
                metadata: { from: previousStart?.toISOString() ?? null, to: slot.start.toISOString() },
            },
        });

        socketService.emitToCompany(ctx.companyId, 'schedule:updated', updated);

        try {
            const message = `${ctx.customer.name} rescheduled "${ctx.job.title}" to ${formatWhen(slot.start, ctx.timeZone)}.`;
            await notificationService.notifyStaff(ctx.companyId, 'Customer rescheduled', message);
            if (ctx.job.techId) {
                await notificationService.notifyUser(
                    ctx.job.techId, ctx.companyId, 'ALERT', 'Job moved', message, jobPushLink(ctx.job.id),
                );
            }
        } catch {
            /* non-blocking — the job has already moved */
        }

        return updated;
    },

    getPortalJobDetail: async (token: string, jobId: string) => {
        const { customerId, companyId } = await portalService.validateToken(token);

        const job = await prisma.job.findFirst({
            where: { id: jobId, customerId, companyId, deletedAt: null },
            include: {
                property: { select: { addressLine1: true, addressLine2: true, city: true, state: true, zip: true } },
                tech: { select: { firstName: true, lastName: true } },
                lineItems: true,
                photos: { select: { url: true, thumbnailUrl: true, caption: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
                invoice: { select: { id: true, invoiceNumber: true, status: true, total: true, balance: true, publicToken: true } },
            },
        });

        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        return job;
    },

    approveEstimateViaPortal: async (token: string, estimateId: string, signerName: string, signatureUrl: string) => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);

        const estimate = await prisma.estimate.findFirst({
            where: { id: estimateId, customerId, companyId },
        });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status !== 'SENT') {
            throw new AppError('Estimate cannot be approved', StatusCodes.BAD_REQUEST);
        }

        const updated = await prisma.estimate.update({
            where: { id: estimateId },
            data: {
                status: 'APPROVED',
                signerName,
                signatureUrl,
                signedAt: new Date(),
                approvedAt: new Date(),
            },
        });

        // Best-effort: let the office know the quote closed. Never block the
        // customer's approval on a notification failure.
        try {
            await notificationService.notifyStaffEstimateDecision(companyId, 'APPROVED', {
                estimateId,
                customerName: customer.name,
                total: Number(estimate.total),
                signerName,
            });
        } catch {
            /* non-blocking — the estimate is already approved */
        }

        return updated;
    },

    declineEstimateViaPortal: async (token: string, estimateId: string) => {
        const { customerId, companyId, customer } = await portalService.validateToken(token);

        const estimate = await prisma.estimate.findFirst({
            where: { id: estimateId, customerId, companyId },
        });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status !== 'SENT') {
            throw new AppError('Estimate cannot be declined', StatusCodes.BAD_REQUEST);
        }

        const updated = await prisma.estimate.update({
            where: { id: estimateId },
            data: {
                status: 'DECLINED',
                declinedAt: new Date(),
            },
        });

        // Best-effort: alert the office that the customer declined.
        try {
            await notificationService.notifyStaffEstimateDecision(companyId, 'DECLINED', {
                estimateId,
                customerName: customer.name,
                total: Number(estimate.total),
            });
        } catch {
            /* non-blocking — the estimate is already declined */
        }

        return updated;
    },
};
