import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';
import { notificationService } from '../../services/notifications/notification.service';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const logSchema = z.object({
    type: z.enum(['ODOMETER', 'SERVICE', 'FUEL', 'REPAIR']).default('SERVICE'),
    odometerKm: z.number().int().optional(),
    cost: z.number().optional(),
    description: z.string().optional(),
    nextServiceKm: z.number().int().optional(),
    nextServiceAt: z.string().datetime().optional(),
});

const RE_ALERT_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const dispatcherIds = async (companyId: string) =>
    (await prisma.user.findMany({
        where: {
            companyId,
            status: 'ACTIVE',
            role: { in: ['ADMIN', 'OFFICE', 'DISPATCHER'] },
        },
        select: { id: true },
    })).map((u) => u.id);

export const vanServiceService = {
    addLog: async (vanId: string, companyId: string, userId: string, input: unknown) => {
        const data = logSchema.parse(input);
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const log = await prisma.vanServiceLog.create({
            data: {
                companyId, vanId, userId,
                type: data.type,
                odometerKm: data.odometerKm ?? null,
                cost: data.cost ?? null,
                description: data.description,
                nextServiceKm: data.nextServiceKm ?? null,
                nextServiceAt: data.nextServiceAt ? new Date(data.nextServiceAt) : null,
            },
        });

        // Apply odometer / service updates back onto the van.
        const updates: any = {};
        if (data.odometerKm != null) updates.odometerKm = data.odometerKm;
        if (data.type === 'SERVICE') {
            updates.lastServiceAt = new Date();
            if (data.odometerKm != null) updates.lastServiceKm = data.odometerKm;
            if (data.nextServiceKm != null) updates.nextServiceKm = data.nextServiceKm;
            if (data.nextServiceAt) updates.nextServiceAt = new Date(data.nextServiceAt);
            // Clear suppression so a new alert can fire when the next due date arrives.
            updates.serviceAlertSentAt = null;
        }
        if (Object.keys(updates).length > 0) {
            await prisma.van.update({ where: { id: vanId }, data: updates });
        }

        return log;
    },

    listLogs: async (vanId: string, companyId: string) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);
        return prisma.vanServiceLog.findMany({
            where: { vanId, companyId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    },

    /** Daily sweep — alert dispatchers when a van is due (or overdue) for service. */
    runSweep: async () => {
        const now = new Date();
        const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days out

        const vans = await prisma.van.findMany({
            where: { active: true },
            include: { company: { select: { id: true, name: true } } },
        });

        let created = 0;
        for (const van of vans) {
            const reasons: string[] = [];

            // Date-based
            if (van.nextServiceAt && van.nextServiceAt <= soon) {
                const overdue = van.nextServiceAt < now;
                reasons.push(overdue
                    ? `service was due ${van.nextServiceAt.toLocaleDateString()}`
                    : `service due by ${van.nextServiceAt.toLocaleDateString()}`);
            }
            // Odometer-based
            if (van.nextServiceKm != null && van.odometerKm != null) {
                const remaining = van.nextServiceKm - van.odometerKm;
                if (remaining <= 500) {
                    reasons.push(remaining <= 0
                        ? `over by ${Math.abs(remaining)} km`
                        : `${remaining} km until service`);
                }
            }

            if (reasons.length === 0) continue;

            // Throttle: don't re-alert within 14 days.
            if (van.serviceAlertSentAt && now.getTime() - van.serviceAlertSentAt.getTime() < RE_ALERT_AFTER_MS) {
                continue;
            }

            const message = `${van.name} — ${reasons.join('; ')}`;
            const recipients = await dispatcherIds(van.companyId);
            for (const userId of recipients) {
                await notificationService.notifyUser(
                    userId,
                    van.companyId,
                    'ALERT',
                    'Van service due',
                    message,
                );
            }
            await prisma.van.update({
                where: { id: van.id },
                data: { serviceAlertSentAt: now },
            });
            created++;
        }
        logger.info({ created, scanned: vans.length }, 'Van service alert sweep complete');
        return { created, scanned: vans.length };
    },
};

export const startVanServiceScheduler = () => {
    const interval = 24 * 60 * 60 * 1000; // daily
    const run = async () => {
        try { await vanServiceService.runSweep(); }
        catch (err: any) { logger.error({ err: err.message }, 'Van service sweep crashed'); }
    };
    setInterval(run, interval);
    setTimeout(run, 60_000);
};
