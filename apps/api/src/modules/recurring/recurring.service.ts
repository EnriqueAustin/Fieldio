import { prisma } from '@fieldio/database';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../middleware/error';
import { logger } from '../../utils/logger';

type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

// Generated jobs carry no explicit end, so give them a default one-hour block.
const DEFAULT_JOB_MINUTES = 60;

/**
 * Add whole months, clamping to the last day of the target month. `anchorDay` is
 * the plan's original day-of-month, so Jan 31 -> Feb 28 -> Mar 31 (not Mar 3).
 */
const addMonths = (date: Date, months: number, anchorDay: number): Date => {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(anchorDay, daysInMonth));
    return d;
};

export const advance = (date: Date, freq: string, anchorDay: number = date.getDate()): Date => {
    switch (freq) {
        case 'WEEKLY': { const d = new Date(date); d.setDate(d.getDate() + 7); return d; }
        case 'BIWEEKLY': { const d = new Date(date); d.setDate(d.getDate() + 14); return d; }
        case 'MONTHLY': return addMonths(date, 1, anchorDay);
        case 'QUARTERLY': return addMonths(date, 3, anchorDay);
        case 'SEMIANNUAL': return addMonths(date, 6, anchorDay);
        case 'ANNUAL': return addMonths(date, 12, anchorDay);
        default: return new Date(date);
    }
};

// Hard stop so a corrupt frequency can never spin the scheduler.
const MAX_STEPS = 5000;

/** First occurrence of the schedule that is >= `target` (unchanged if already there). */
const rollToOnOrAfter = (from: Date, freq: string, anchorDay: number, target: Date): Date => {
    let cur = from;
    for (let i = 0; i < MAX_STEPS && cur.getTime() < target.getTime(); i++) {
        const next = advance(cur, freq, anchorDay);
        if (next.getTime() <= cur.getTime()) break;
        cur = next;
    }
    return cur;
};

/** First occurrence of the schedule strictly after `target`. */
const rollToAfter = (from: Date, freq: string, anchorDay: number, target: Date): Date => {
    let cur = from;
    for (let i = 0; i < MAX_STEPS && cur.getTime() <= target.getTime(); i++) {
        const next = advance(cur, freq, anchorDay);
        if (next.getTime() <= cur.getTime()) break;
        cur = next;
    }
    return cur;
};

export const recurringService = {
    create: async (params: {
        companyId: string;
        customerId: string;
        propertyId: string;
        title: string;
        description?: string;
        frequency: Frequency;
        startDate: Date;
        endDate?: Date;
        template?: any;
    }) => {
        // The customer must be ours...
        const customer = await prisma.customer.findFirst({
            where: { id: params.customerId, companyId: params.companyId, deletedAt: null },
            select: { id: true },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        // ...and the property must be ours and belong to that customer.
        const property = await prisma.property.findFirst({
            where: { id: params.propertyId, companyId: params.companyId, customerId: params.customerId },
            select: { id: true },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);

        return prisma.recurringPlan.create({
            data: { ...params, nextRunAt: params.startDate, active: true },
        });
    },

    list: async (companyId: string) => {
        const plans = await prisma.recurringPlan.findMany({
            where: { companyId },
            orderBy: { nextRunAt: 'asc' },
        });
        const customerIds = [...new Set(plans.map((plan) => plan.customerId))];
        const propertyIds = [...new Set(plans.map((plan) => plan.propertyId))];
        const customers = await prisma.customer.findMany({
            where: { id: { in: customerIds }, companyId },
            select: { id: true, name: true },
        });
        const properties = await prisma.property.findMany({
            where: { id: { in: propertyIds }, companyId },
            select: { id: true, addressLine1: true, city: true },
        });
        const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
        const propertyMap = new Map(properties.map((property) => [property.id, property]));

        return plans.map((plan) => ({
            ...plan,
            customer: customerMap.get(plan.customerId) ?? null,
            property: propertyMap.get(plan.propertyId) ?? null,
            // An ended plan is never "due", even if nextRunAt is behind us.
            isDue:
                plan.active &&
                plan.nextRunAt.getTime() <= Date.now() &&
                (!plan.endDate || plan.nextRunAt.getTime() <= plan.endDate.getTime()),
        }));
    },

    update: async (
        id: string,
        companyId: string,
        patch: {
            title?: string;
            description?: string | null;
            frequency?: Frequency;
            nextRunAt?: Date;
            endDate?: Date | null;
            active?: boolean;
        },
    ) => {
        const existing = await prisma.recurringPlan.findFirst({ where: { id, companyId } });
        if (!existing) throw new AppError('Recurring plan not found', StatusCodes.NOT_FOUND);

        // Drop undefined keys so omitted fields are never overwritten.
        const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch;
        // Reactivating an INACTIVE plan whose date is in the past must not back-fill:
        // jump to the first occurrence on or after now. The PATCH itself never
        // creates a job, and an already-active plan keeps any due occurrence.
        if (patch.active === true && existing.active === false) {
            const now = new Date();
            const nextRunAt = patch.nextRunAt ?? existing.nextRunAt;
            if (nextRunAt.getTime() < now.getTime()) {
                data.nextRunAt = rollToOnOrAfter(
                    nextRunAt,
                    patch.frequency ?? existing.frequency,
                    existing.startDate.getDate(),
                    now,
                );
            }
        }

        const { count } = await prisma.recurringPlan.updateMany({ where: { id, companyId }, data });
        if (count === 0) throw new AppError('Recurring plan not found', StatusCodes.NOT_FOUND);
        return prisma.recurringPlan.findFirst({ where: { id, companyId } });
    },

    deactivate: async (id: string, companyId: string) => {
        const { count } = await prisma.recurringPlan.updateMany({
            where: { id, companyId },
            data: { active: false },
        });
        if (count === 0) throw new AppError('Recurring plan not found', StatusCodes.NOT_FOUND);
    },

    /**
     * Cron: scan all due recurring plans and create REQUESTED jobs from them.
     * Creates at most ONE job per plan per run, for the most recent occurrence that
     * is due, then moves nextRunAt past now so a plan that fell behind (or was
     * reactivated) never emits a job on every tick.
     * Pass `companyId` to run for a single tenant (manual "generate now").
     */
    runDuePlans: async (companyId?: string) => {
        const now = new Date();
        const due = await prisma.recurringPlan.findMany({
            where: {
                ...(companyId ? { companyId } : {}),
                active: true,
                nextRunAt: { lte: now },
                OR: [{ endDate: null }, { endDate: { gte: now } }],
            },
        });
        let created = 0;
        let failed = 0;
        for (const plan of due) {
            try {
                const anchorDay = plan.startDate.getDate();
                // Most recent due occurrence, never beyond the plan end date.
                let occurrence = plan.nextRunAt;
                for (let i = 0; i < MAX_STEPS; i++) {
                    const next = advance(occurrence, plan.frequency, anchorDay);
                    if (next.getTime() <= occurrence.getTime() || next.getTime() > now.getTime()) break;
                    if (plan.endDate && next.getTime() > plan.endDate.getTime()) break;
                    occurrence = next;
                }

                // Past its end date: finish the plan without generating or advancing.
                if (plan.endDate && occurrence.getTime() > plan.endDate.getTime()) {
                    await prisma.recurringPlan.updateMany({
                        where: { id: plan.id, nextRunAt: plan.nextRunAt, active: true },
                        data: { active: false },
                    });
                    continue;
                }

                const nextRunAt = rollToAfter(occurrence, plan.frequency, anchorDay, now);
                const finished = !!plan.endDate && nextRunAt.getTime() > plan.endDate.getTime();

                const generated = await prisma.$transaction(async (tx) => {
                    // Claim the occurrence first. Only the run that moves nextRunAt off
                    // the value it read may create the job, so concurrent runs, other
                    // API instances, or a mid-run deactivation cannot double-generate.
                    const claim = await tx.recurringPlan.updateMany({
                        where: { id: plan.id, nextRunAt: plan.nextRunAt, active: true },
                        data: { nextRunAt, ...(finished ? { active: false } : {}) },
                    });
                    if (claim.count !== 1) return false;
                    await tx.job.create({
                        data: {
                            companyId: plan.companyId,
                            customerId: plan.customerId,
                            propertyId: plan.propertyId,
                            title: plan.title,
                            description: plan.description,
                            scheduledStart: occurrence,
                            scheduledEnd: new Date(occurrence.getTime() + DEFAULT_JOB_MINUTES * 60 * 1000),
                            status: 'REQUESTED',
                            recurringPlanId: plan.id,
                        },
                    });
                    return true;
                });
                if (generated) created++;
            } catch (err) {
                failed++;
                logger.error(
                    { planId: plan.id, err: err instanceof Error ? err.message : String(err) },
                    'Recurring plan generation failed',
                );
            }
        }
        if (created > 0 || failed > 0) logger.info({ created, failed }, 'Recurring plan jobs generated');
        return { created, failed };
    },
};

/**
 * Lightweight in-process scheduler. Runs every 10 minutes.
 * For production, replace with BullMQ or an external cron.
 */
export const startRecurringScheduler = () => {
    setInterval(() => {
        recurringService.runDuePlans().catch((err) =>
            logger.error({ err: err.message }, 'Recurring scheduler error')
        );
    }, 10 * 60 * 1000);
};
