import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';
import { notificationService } from '../../services/notifications/notification.service';

const formatWhen = (d: Date) => {
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

export const remindersService = {
    /**
     * Sweep upcoming jobs and fire 24h and 1h reminders.
     * Idempotent — uses reminder24hSentAt / reminder1hSentAt to dedupe.
     */
    runSweep: async () => {
        const now = new Date();
        const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
        const in75m = new Date(now.getTime() + 75 * 60 * 1000);

        // 24h window: jobs scheduled between now+23h and now+25h, no 24h sent yet
        const due24h = await prisma.job.findMany({
            where: {
                deletedAt: null,
                status: { in: ['ASSIGNED', 'EN_ROUTE'] },
                scheduledStart: { gte: new Date(now.getTime() + 23 * 60 * 60 * 1000), lte: in25h },
                reminder24hSentAt: null,
            },
            include: { customer: true },
            take: 200,
        });

        // 1h window: jobs scheduled between now+45m and now+75m, no 1h sent yet
        const due1h = await prisma.job.findMany({
            where: {
                deletedAt: null,
                status: { in: ['ASSIGNED', 'EN_ROUTE'] },
                scheduledStart: { gte: new Date(now.getTime() + 45 * 60 * 1000), lte: in75m },
                reminder1hSentAt: null,
            },
            include: { customer: true },
            take: 200,
        });

        let sent = 0;

        for (const job of due24h) {
            if (!job.customer || !job.scheduledStart) continue;
            try {
                await notificationService.notifyCustomer(
                    job.customerId,
                    job.companyId,
                    'APPOINTMENT_REMINDER',
                    { when: formatWhen(job.scheduledStart) },
                );
                await prisma.job.update({
                    where: { id: job.id },
                    data: { reminder24hSentAt: new Date() },
                });
                sent++;
            } catch (err: any) {
                logger.warn({ jobId: job.id, err: err.message }, '24h reminder failed');
            }
        }

        for (const job of due1h) {
            if (!job.customer || !job.scheduledStart) continue;
            try {
                await notificationService.notifyCustomer(
                    job.customerId,
                    job.companyId,
                    'APPOINTMENT_REMINDER',
                    { when: `in about 1 hour (${formatWhen(job.scheduledStart)})` },
                );
                await prisma.job.update({
                    where: { id: job.id },
                    data: { reminder1hSentAt: new Date() },
                });
                sent++;
            } catch (err: any) {
                logger.warn({ jobId: job.id, err: err.message }, '1h reminder failed');
            }
        }

        if (sent > 0) {
            logger.info({ sent, scanned24h: due24h.length, scanned1h: due1h.length }, 'Appointment reminders sent');
        }
        return { sent, scanned24h: due24h.length, scanned1h: due1h.length };
    },
};

export const startAppointmentReminderScheduler = () => {
    const interval = 15 * 60 * 1000; // every 15 minutes
    const run = async () => {
        try { await remindersService.runSweep(); }
        catch (err: any) { logger.error({ err: err.message }, 'Appointment reminder sweep crashed'); }
    };
    setInterval(run, interval);
    setTimeout(run, 90_000);
};
