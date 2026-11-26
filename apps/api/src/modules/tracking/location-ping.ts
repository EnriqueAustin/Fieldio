import { z } from 'zod';
import { prisma } from '@fieldio/database';
import { socketService } from '../../services/socket.service';
import { evaluateGeofence } from './geofence';

/** One device position. Shared by POST /tracking/ping and the EN_ROUTE status change. */
export const locationFixSchema = z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    // Metres. Anything coarser than 10 km is a cell-tower guess, not a fix.
    accuracy: z.number().finite().nonnegative().max(10_000).optional(),
});
export type LocationFixInput = z.infer<typeof locationFixSchema>;

const PERSIST_EVERY_MS = 30_000;

/**
 * Stores a technician's position, at most one row per ~30s per user, and
 * broadcasts it to the dispatch map. Callers must already have checked that
 * the user is on the way to a job (POPIA).
 */
export async function recordLocationPing(params: {
    companyId: string;
    userId: string;
    fix: LocationFixInput;
    /** Off for the fix sent with a status change, so geofence can't race that transition. */
    evaluateGeofence?: boolean;
}): Promise<boolean> {
    const { companyId, userId, fix } = params;
    const recent = await prisma.userLocationPing.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() <= PERSIST_EVERY_MS) return false;

    await prisma.userLocationPing.create({
        // Explicit server time: the ETA read straight after must see this fix as fresh.
        data: { userId, companyId, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, createdAt: new Date() },
    });
    if (params.evaluateGeofence !== false) {
        // Fire-and-forget geofence evaluation
        evaluateGeofence({ companyId, userId, lat: fix.lat, lng: fix.lng }).catch(() => undefined);
    }
    // Broadcast only when we actually persisted — the dispatch map reacts to
    // this, so it must be throttled the same ~30s as the write.
    socketService.emitToCompany(companyId, 'tech:location', {
        userId,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        at: new Date().toISOString(),
    });
    return true;
}
