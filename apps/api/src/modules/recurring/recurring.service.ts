import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';

const advance = (date: Date, freq: string): Date => {
    const d = new Date(date);
    switch (freq) {
        case 'WEEKLY': d.setDate(d.getDate() + 7); break;
        case 'BIWEEKLY': d.setDate(d.getDate() + 14); break;
        case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
        case 'QUARTERLY': d.setMonth(d.getMonth() + 3); break;
        case 'SEMIANNUAL': d.setMonth(d.getMonth() + 6); break;
        case 'ANNUAL': d.setFullYear(d.getFullYear() + 1); break;
    }
    return d;
};

export const recurringService = {
    create: async (params: {
        companyId: string;
        customerId: string;
        propertyId: string;
        title: string;
        description?: string;
        frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
        startDate: Date;
        endDate?: Date;
        template?: any;
    }) => {
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
            isDue: plan.nextRunAt.getTime() <= Date.now(),
        }));
    },

    deactivate: (id: string, companyId: string) =>
        prisma.recurringPlan.updateMany({
            where: { id, companyId },
            data: { active: false },
        }),

    /**
     * Cron: scan all due recurring plans and create REQUESTED jobs from them.
     * Safe to run on an interval (idempotent within a 5-min window).
     */
    runDuePlans: async () => {
        const now = new Date();
        const due = await prisma.recurringPlan.findMany({
            where: {
                active: true,
                nextRunAt: { lte: now },
                OR: [{ endDate: null }, { endDate: { gte: now } }],
            },
        });
        let created = 0;
        for (const plan of due) {
            await prisma.$transaction(async (tx) => {
                await tx.job.create({
                    data: {
                        companyId: plan.companyId,
                        customerId: plan.customerId,
                        propertyId: plan.propertyId,
                        title: plan.title,
                        description: plan.description,
                        scheduledStart: plan.nextRunAt,
                        status: 'REQUESTED',
                        recurringPlanId: plan.id,
                    },
                });
                await tx.recurringPlan.update({
                    where: { id: plan.id },
                    data: { nextRunAt: advance(plan.nextRunAt, plan.frequency) },
                });
            });
            created++;
        }
        if (created > 0) logger.info({ created }, 'Recurring plan jobs generated');
        return { created };
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
