import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';

// Read at call time (not from the frozen config) so it is testable.
export const isProductionRuntime = () => process.env.NODE_ENV === 'production';

/**
 * A provider with no credentials. Development/test keep the dev stub (logged and
 * marked SENT with providerId 'dev-stub'); production must never fake a send —
 * the log is marked FAILED and the error is logged loudly.
 */
export const handleUnconfiguredProvider = async (params: {
    logId: string | null | undefined;
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
    missing: string;
    devLog: () => void;
}): Promise<{ ok: true; dev: true; providerId: 'dev-stub' } | { ok: false; error: string }> => {
    if (isProductionRuntime()) {
        const error = `${params.channel} provider not configured (${params.missing} missing) — message not sent`;
        logger.error({ channel: params.channel, notificationLogId: params.logId }, error);
        if (params.logId) {
            await prisma.notificationLog.update({
                where: { id: params.logId },
                data: { status: 'FAILED', error },
            }).catch(() => undefined);
        }
        return { ok: false, error };
    }

    params.devLog();
    if (params.logId) {
        await prisma.notificationLog.update({
            where: { id: params.logId },
            data: { status: 'SENT', providerId: 'dev-stub' },
        }).catch(() => undefined);
    }
    return { ok: true, dev: true, providerId: 'dev-stub' };
};
