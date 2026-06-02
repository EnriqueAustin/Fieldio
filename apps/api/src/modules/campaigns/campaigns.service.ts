import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { notificationService } from '../../services/notifications/notification.service';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const createCampaignSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['UNSOLD_ESTIMATE', 'SEASONAL_REMINDER', 'SERVICE_ANNIVERSARY', 'MEMBERSHIP_RENEWAL', 'CUSTOM']),
    trigger: z.object({
        daysSince: z.number().int().min(1).optional(),
        seasonMonth: z.number().int().min(1).max(12).optional(),
        customFilter: z.any().optional(),
    }),
    template: z.object({
        subject: z.string().optional(),
        body: z.string(),
        smsBody: z.string().optional(),
    }),
    channels: z.array(z.enum(['EMAIL', 'SMS', 'WHATSAPP'])).min(1),
});

const updateCampaignSchema = createCampaignSchema.partial().extend({
    status: z.enum(['ACTIVE', 'PAUSED', 'DRAFT']).optional(),
});

export const campaignService = {
    getAll: async (companyId: string) => {
        return prisma.campaign.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { sends: true } } },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const campaign = await prisma.campaign.findFirst({
            where: { id, companyId },
            include: {
                sends: { orderBy: { sentAt: 'desc' }, take: 50 },
                _count: { select: { sends: true } },
            },
        });
        if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND);
        return campaign;
    },

    create: async (companyId: string, input: z.infer<typeof createCampaignSchema>) => {
        const parsed = createCampaignSchema.parse(input);
        return prisma.campaign.create({
            data: { companyId, ...parsed },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateCampaignSchema>) => {
        const parsed = updateCampaignSchema.parse(input);
        const campaign = await prisma.campaign.findFirst({ where: { id, companyId } });
        if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND);
        return prisma.campaign.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const campaign = await prisma.campaign.findFirst({ where: { id, companyId } });
        if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND);
        await prisma.campaignSend.deleteMany({ where: { campaignId: id } });
        await prisma.campaign.delete({ where: { id } });
        return { deleted: true };
    },

    getStats: async (id: string, companyId: string) => {
        const campaign = await prisma.campaign.findFirst({ where: { id, companyId } });
        if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND);

        const sends = await prisma.campaignSend.groupBy({
            by: ['status'],
            where: { campaignId: id },
            _count: { id: true },
        });

        return {
            campaignId: id,
            totalSends: sends.reduce((sum, s) => sum + s._count.id, 0),
            breakdown: Object.fromEntries(sends.map((s) => [s.status, s._count.id])),
        };
    },

    // --- Automated runners ---
    runUnsoldEstimateFollowups: async () => {
        const campaigns = await prisma.campaign.findMany({
            where: { type: 'UNSOLD_ESTIMATE', status: 'ACTIVE' },
        });

        for (const campaign of campaigns) {
            const trigger = campaign.trigger as any;
            const daysSince = trigger?.daysSince ?? 7;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - daysSince);

            const unsoldEstimates = await prisma.estimate.findMany({
                where: {
                    companyId: campaign.companyId,
                    status: 'SENT',
                    createdAt: { lte: cutoff },
                },
                include: {
                    customer: { select: { id: true, name: true, email: true, phone: true } },
                },
                take: 50,
            });

            for (const estimate of unsoldEstimates) {
                const alreadySent = await prisma.campaignSend.findFirst({
                    where: { campaignId: campaign.id, customerId: estimate.customerId },
                });
                if (alreadySent) continue;

                try {
                    await prisma.campaignSend.create({
                        data: {
                            campaignId: campaign.id,
                            customerId: estimate.customerId,
                            channel: campaign.channels[0] || 'EMAIL',
                            status: 'SENT',
                        },
                    });
                    logger.info({ campaignId: campaign.id, customerId: estimate.customerId }, 'Unsold estimate follow-up sent');
                } catch (err: any) {
                    logger.error({ err: err.message }, 'Failed to send campaign');
                }
            }
        }
    },

    runServiceAnniversaryReminders: async () => {
        const campaigns = await prisma.campaign.findMany({
            where: { type: 'SERVICE_ANNIVERSARY', status: 'ACTIVE' },
        });

        for (const campaign of campaigns) {
            const trigger = campaign.trigger as any;
            const daysSince = trigger?.daysSince ?? 365;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - daysSince);
            const windowStart = new Date(cutoff);
            windowStart.setDate(windowStart.getDate() - 7);

            const customers = await prisma.job.findMany({
                where: {
                    companyId: campaign.companyId,
                    status: 'COMPLETED',
                    deletedAt: null,
                    actualEnd: { gte: windowStart, lte: cutoff },
                },
                select: { customerId: true },
                distinct: ['customerId'],
                take: 100,
            });

            for (const { customerId } of customers) {
                const recentJob = await prisma.job.findFirst({
                    where: { customerId, companyId: campaign.companyId, status: 'COMPLETED', deletedAt: null, actualEnd: { gt: cutoff } },
                });
                if (recentJob) continue;

                const alreadySent = await prisma.campaignSend.findFirst({
                    where: { campaignId: campaign.id, customerId, sentAt: { gte: windowStart } },
                });
                if (alreadySent) continue;

                await prisma.campaignSend.create({
                    data: {
                        campaignId: campaign.id,
                        customerId,
                        channel: campaign.channels[0] || 'EMAIL',
                        status: 'SENT',
                    },
                });
                logger.info({ campaignId: campaign.id, customerId }, 'Service anniversary reminder sent');
            }
        }
    },
};

let campaignInterval: ReturnType<typeof setInterval> | null = null;

export const startCampaignScheduler = () => {
    if (campaignInterval) return;
    campaignInterval = setInterval(async () => {
        try {
            await campaignService.runUnsoldEstimateFollowups();
            await campaignService.runServiceAnniversaryReminders();
        } catch (err: any) {
            logger.error({ err: err.message }, 'Campaign scheduler error');
        }
    }, 60 * 60 * 1000); // Every hour

    setTimeout(async () => {
        try {
            await campaignService.runUnsoldEstimateFollowups();
            await campaignService.runServiceAnniversaryReminders();
        } catch {}
    }, 60_000);

    logger.info('Campaign scheduler started (every 60 min)');
};
