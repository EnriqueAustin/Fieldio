import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';
import { notificationService } from '../../services/notifications/notification.service';
import { config } from '../../config/env';

const FOLLOWUP_INTERVAL_DAYS = [3, 7, 14]; // each followup tier

export const estimateFollowupsService = {
    runSweep: async () => {
        const now = new Date();
        const candidates = await prisma.estimate.findMany({
            where: {
                status: 'SENT',
                sentAt: { not: null },
                followupCount: { lt: FOLLOWUP_INTERVAL_DAYS.length },
            },
            include: { customer: true, company: { select: { id: true } } },
            take: 200,
        });

        let sent = 0;
        for (const est of candidates) {
            const daysSinceLast = est.followupLastSentAt
                ? Math.floor((now.getTime() - new Date(est.followupLastSentAt).getTime()) / 86_400_000)
                : Math.floor((now.getTime() - new Date(est.sentAt!).getTime()) / 86_400_000);
            const nextThreshold = FOLLOWUP_INTERVAL_DAYS[est.followupCount];
            if (daysSinceLast < nextThreshold) continue;

            try {
                const token = est.publicToken;
                const viewUrl = token ? `${config.WEB_URL}/estimate/${token}` : `${config.WEB_URL}/estimates/${est.id}`;
                await notificationService.notifyCustomer(est.customerId, est.companyId, 'ESTIMATE_SENT', {
                    estimateId: est.id,
                    total: Number(est.total),
                    viewUrl,
                });
                await prisma.estimate.update({
                    where: { id: est.id },
                    data: {
                        followupCount: est.followupCount + 1,
                        followupLastSentAt: now,
                    },
                });
                sent++;
            } catch (err) {
                logger.error({ err, estimateId: est.id }, 'Estimate followup failed');
            }
        }
        logger.info({ sent, scanned: candidates.length }, 'Estimate followup sweep complete');
        return { sent, scanned: candidates.length };
    },
};

export const startEstimateFollowupScheduler = () => {
    const interval = 6 * 60 * 60 * 1000; // every 6h
    const run = async () => {
        try { await estimateFollowupsService.runSweep(); }
        catch (err) { logger.error({ err }, 'Estimate followup sweep crashed'); }
    };
    setInterval(run, interval);
    setTimeout(run, 60_000);
};
