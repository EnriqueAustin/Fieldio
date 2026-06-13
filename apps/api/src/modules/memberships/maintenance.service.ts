import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';

/**
 * Auto-generate the next visit job for active memberships whose nextVisitAt has arrived.
 * Uses the tier's visitFrequencyDays + visitJobTitle. Creates the job in REQUESTED state for dispatch.
 */
export const membershipMaintenanceService = {
    runSweep: async () => {
        const now = new Date();
        const due = await prisma.membership.findMany({
            where: {
                status: 'ACTIVE',
                OR: [
                    { nextVisitAt: null },
                    { nextVisitAt: { lte: now } },
                ],
            },
            include: { tier: true, customer: true },
            take: 200,
        });

        let created = 0;
        for (const m of due) {
            if (!m.tier.visitFrequencyDays || !m.tier.includedVisits) {
                continue;
            }
            if (m.visitsUsed >= m.tier.includedVisits) continue;

            // Pick any property of the customer (default = first)
            const property = await prisma.property.findFirst({
                where: { customerId: m.customerId, companyId: m.companyId },
            });
            if (!property) continue;

            const scheduledStart = new Date(now);
            scheduledStart.setHours(9, 0, 0, 0);
            const scheduledEnd = new Date(scheduledStart);
            scheduledEnd.setHours(scheduledEnd.getHours() + 2);

            await prisma.job.create({
                data: {
                    companyId: m.companyId,
                    customerId: m.customerId,
                    propertyId: property.id,
                    title: m.tier.visitJobTitle ?? `${m.tier.name} maintenance visit`,
                    description: `Auto-generated from ${m.tier.name} membership.`,
                    status: 'REQUESTED',
                    priority: 'MEDIUM',
                    scheduledStart,
                    scheduledEnd,
                },
            });
            const nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + m.tier.visitFrequencyDays);
            await prisma.membership.update({
                where: { id: m.id },
                data: { nextVisitAt: nextDate, visitsUsed: m.visitsUsed + 1 },
            });
            created++;
        }
        logger.info({ created, candidates: due.length }, 'Membership maintenance sweep complete');
        return { created, candidates: due.length };
    },
};

export const startMembershipMaintenanceScheduler = () => {
    const interval = 12 * 60 * 60 * 1000; // twice daily
    const run = async () => {
        try { await membershipMaintenanceService.runSweep(); }
        catch (err) { logger.error({ err }, 'Membership maintenance sweep crashed'); }
    };
    setInterval(run, interval);
    setTimeout(run, 90_000);
};
