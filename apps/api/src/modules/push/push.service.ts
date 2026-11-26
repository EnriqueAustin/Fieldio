import webpush from 'web-push';
import { z } from 'zod';
import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Web Push (VAPID) delivery for job alerts when the app is closed.
 *
 * Disabled — a no-op, logged once — until VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY are set, so boot and tests never depend on it.
 */

/** What the service worker shows. Never carries prices or customer money. */
export interface PushPayload {
    title: string;
    body: string;
    /** In-app path the notification opens. */
    url: string;
    /** Same tag replaces the previous notification (e.g. one per job). */
    tag: string;
}

// The server POSTs to whatever endpoint a client registers, so only accept the
// browser vendors' push services (Chrome/Edge/Samsung via FCM, Firefox, Safari/iOS,
// legacy Edge via WNS) rather than any URL.
const PUSH_SERVICE_HOSTS = [
    'fcm.googleapis.com',
    'android.googleapis.com',
    'push.services.mozilla.com',
    'push.apple.com',
    'notify.windows.com',
];

const isPushServiceUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        const host = url.hostname.toLowerCase();
        return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
};

const endpointSchema = z
    .string()
    .max(2048)
    .refine(isPushServiceUrl, 'Endpoint must be a browser push service URL');

// Shape of `PushSubscription.toJSON()` from the browser.
export const subscribeSchema = z.object({
    endpoint: endpointSchema,
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512),
    }),
});

export const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2048) });

const PUSH_TTL_SECONDS = 60 * 60 * 4;

let warnedDisabled = false;
// Key pair web-push is currently configured with, so a changed config (tests,
// hot reload) re-applies setVapidDetails instead of using stale keys.
let configuredWith: string | null = null;

const defaultSubject = (): string =>
    config.WEB_URL?.startsWith('https://') ? config.WEB_URL : 'mailto:noreply@fieldio.app';

/** True when VAPID keys are present and web-push accepted them. */
const ensureConfigured = (): boolean => {
    const publicKey = config.VAPID_PUBLIC_KEY;
    const privateKey = config.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
        if (!warnedDisabled) {
            warnedDisabled = true;
            logger.info('Web push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set');
        }
        configuredWith = null;
        return false;
    }
    const subject = config.VAPID_SUBJECT ?? defaultSubject();
    const signature = `${publicKey}|${privateKey}|${subject}`;
    if (configuredWith === signature) return true;
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        configuredWith = signature;
        return true;
    } catch (err) {
        if (!warnedDisabled) {
            warnedDisabled = true;
            logger.error(
                { err: err instanceof Error ? err.message : String(err) },
                'Web push disabled: VAPID keys rejected',
            );
        }
        return false;
    }
};

const statusOf = (err: unknown): number | undefined =>
    err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : undefined;

export const pushService = {
    isEnabled: (): boolean => ensureConfigured(),

    /** Public VAPID key the browser subscribes with, or null when push is off. */
    getPublicKey: (): string | null => (ensureConfigured() ? config.VAPID_PUBLIC_KEY ?? null : null),

    /**
     * Save this device for the caller. The endpoint identifies a browser install,
     * so if another user (or tenant) had it — same phone, new login — it moves to
     * the caller; nobody keeps receiving alerts on a phone they logged out of.
     */
    subscribe: async (
        user: { userId: string; companyId: string },
        input: unknown,
        userAgent?: string,
    ) => {
        const parsed = subscribeSchema.parse(input);
        const fields = {
            companyId: user.companyId,
            userId: user.userId,
            p256dh: parsed.keys.p256dh,
            auth: parsed.keys.auth,
            userAgent: userAgent ? userAgent.slice(0, 512) : null,
        };
        return prisma.pushSubscription.upsert({
            where: { endpoint: parsed.endpoint },
            create: { endpoint: parsed.endpoint, ...fields },
            update: fields,
            select: { id: true, endpoint: true, createdAt: true },
        });
    },

    /**
     * Remove this browser's subscription. Matched on the endpoint alone: it is
     * an unguessable capability URL only the browser holding it knows, and a
     * new user signing in on a phone must be able to stop the previous user's
     * alerts (customer names) landing on it, even after that session expired.
     */
    unsubscribe: async (_user: { userId: string; companyId: string }, input: unknown) => {
        const { endpoint } = unsubscribeSchema.parse(input);
        const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint } });
        return { removed: count };
    },

    /** Whether this browser's endpoint is registered, and to the caller. Owner is never revealed. */
    status: async (user: { userId: string; companyId: string }, input: unknown) => {
        const { endpoint } = unsubscribeSchema.parse(input);
        const row = await prisma.pushSubscription.findUnique({
            where: { endpoint },
            select: { userId: true, companyId: true },
        });
        return {
            registered: Boolean(row),
            mine: Boolean(row && row.userId === user.userId && row.companyId === user.companyId),
        };
    },

    /** Drop every device of a user (deactivation, revoked sessions). */
    removeAllForUser: async (userId: string, companyId?: string) => {
        const { count } = await prisma.pushSubscription.deleteMany({
            where: companyId ? { userId, companyId } : { userId },
        });
        return { removed: count };
    },

    /**
     * Push to every device the user registered. Never throws: failures are
     * logged, and subscriptions the push service reports gone (404/410) are
     * deleted so we stop sending to dead endpoints.
     */
    sendToUser: async (userId: string, companyId: string, payload: PushPayload): Promise<void> => {
        try {
            if (!ensureConfigured()) return;
            // A deactivated (or deleted) user must stop getting customer details
            // on a phone they may no longer hold: drop their devices instead.
            const user = await prisma.user.findFirst({
                where: { id: userId, companyId },
                select: { status: true },
            });
            if (user?.status !== 'ACTIVE') {
                await prisma.pushSubscription.deleteMany({ where: { userId, companyId } });
                return;
            }
            const subs = await prisma.pushSubscription.findMany({
                where: { userId, companyId },
                select: { id: true, endpoint: true, p256dh: true, auth: true },
            });
            if (subs.length === 0) return;

            const body = JSON.stringify({
                title: payload.title,
                body: payload.body,
                url: payload.url,
                tag: payload.tag,
            });

            await Promise.all(
                subs.map(async (sub) => {
                    try {
                        await webpush.sendNotification(
                            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                            body,
                            { TTL: PUSH_TTL_SECONDS, urgency: 'high' },
                        );
                        await prisma.pushSubscription
                            .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
                            .catch(() => undefined);
                    } catch (err) {
                        const status = statusOf(err);
                        if (status === 404 || status === 410) {
                            await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
                            logger.info({ userId, subscriptionId: sub.id }, 'Removed expired push subscription');
                            return;
                        }
                        logger.warn(
                            { userId, subscriptionId: sub.id, status, err: err instanceof Error ? err.message : String(err) },
                            'Web push send failed',
                        );
                    }
                }),
            );
        } catch (err) {
            logger.warn(
                { userId, err: err instanceof Error ? err.message : String(err) },
                'Web push delivery failed',
            );
        }
    },
};
