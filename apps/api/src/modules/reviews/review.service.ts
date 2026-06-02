import { prisma } from '@fieldio/database';
import { notificationService } from '../../services/notifications/notification.service';
import { normalizeCompanySettings } from '../company/company-settings';
import { logger } from '../../utils/logger';

export const reviewService = {
    processReviewRequests: async () => {
        const now = new Date();

        const companies = await prisma.company.findMany({
            select: { id: true, name: true, settings: true },
        });

        for (const company of companies) {
            const settings = normalizeCompanySettings(company.settings);
            if (!settings.reviews.enabled || !settings.reviews.googleReviewUrl) continue;

            const delayMs = (settings.reviews.delayHours || 2) * 60 * 60 * 1000;
            const cutoff = new Date(now.getTime() - delayMs);

            const eligibleJobs = await prisma.job.findMany({
                where: {
                    companyId: company.id,
                    status: 'COMPLETED',
                    deletedAt: null,
                    reviewRequestSentAt: null,
                    actualEnd: { not: null, lte: cutoff },
                },
                include: {
                    customer: { select: { id: true, name: true, email: true, phone: true } },
                },
                take: 50,
            });

            for (const job of eligibleJobs) {
                try {
                    await notificationService.notifyCustomer(
                        job.customerId,
                        company.id,
                        'REVIEW_REQUEST',
                        { reviewUrl: settings.reviews.googleReviewUrl, companyName: company.name }
                    );

                    await prisma.job.update({
                        where: { id: job.id },
                        data: { reviewRequestSentAt: now },
                    });

                    logger.info({ jobId: job.id, customerId: job.customerId }, 'Review request sent');
                } catch (err: any) {
                    logger.error({ jobId: job.id, err: err.message }, 'Failed to send review request');
                }
            }
        }
    },
};

let reviewInterval: ReturnType<typeof setInterval> | null = null;

export const startReviewScheduler = () => {
    if (reviewInterval) return;
    reviewInterval = setInterval(() => {
        reviewService.processReviewRequests().catch((err) => {
            logger.error({ err: err.message }, 'Review scheduler error');
        });
    }, 10 * 60 * 1000);

    setTimeout(() => {
        reviewService.processReviewRequests().catch(() => undefined);
    }, 30_000);

    logger.info('Review request scheduler started (every 10 min)');
};
