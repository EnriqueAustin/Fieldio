import { prisma } from '@fieldio/database';
import { estimateEtaMinutes, formatEta, type LocationFix } from '../../utils/eta';
import { logger } from '../../utils/logger';

/**
 * Who may be driving to a job: its technician plus every member of its van
 * crew (on a van job with a lead tech, a crewmate may be the one driving).
 */
async function crewUserIds(job: { companyId: string; techId: string | null; vanId: string | null }) {
    const ids = new Set<string>();
    if (job.techId) ids.add(job.techId);
    if (job.vanId) {
        const members = await prisma.vanMember.findMany({
            where: { vanId: job.vanId, van: { companyId: job.companyId } },
            select: { userId: true },
        });
        for (const m of members) ids.add(m.userId);
    }
    return [...ids];
}

export interface TripJob {
    companyId: string;
    techId: string | null;
    vanId: string | null;
    /** When the job last entered EN_ROUTE (start of this trip). */
    onMyWaySentAt: Date | null;
}

/**
 * Latest fix, from this trip only, of whoever is driving to the job. Fixes from
 * before the job went EN_ROUTE (e.g. the drive to the previous customer) are
 * never used; without a known trip start there is no fix.
 */
export async function latestFixForJob(job: TripJob): Promise<LocationFix | null> {
    if (!job.onMyWaySentAt) return null;
    const userIds = await crewUserIds(job);
    if (userIds.length === 0) return null;
    return prisma.userLocationPing.findFirst({
        where: {
            companyId: job.companyId,
            userId: { in: userIds },
            createdAt: { gte: new Date(job.onMyWaySentAt) },
        },
        orderBy: { createdAt: 'desc' },
        select: { lat: true, lng: true, createdAt: true },
    });
}

/**
 * ETA label for the en-route message ("15 min"), or undefined when the crew
 * has no fresh fix or the site isn't geocoded. Never throws: a lookup failure
 * must not stop the customer hearing that the tech is on the way.
 */
export async function enRouteEtaLabel(job: TripJob & { propertyId: string }): Promise<string | undefined> {
    try {
        const [fix, property] = await Promise.all([
            latestFixForJob(job),
            prisma.property.findFirst({
                where: { id: job.propertyId, companyId: job.companyId },
                select: { geoLat: true, geoLng: true },
            }),
        ]);
        const minutes = estimateEtaMinutes({
            fix,
            destination: property ? { lat: property.geoLat, lng: property.geoLng } : null,
        });
        return minutes === null ? undefined : formatEta(minutes);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'En-route ETA lookup failed');
        return undefined;
    }
}

/** Whether the user is the job's technician or a member of its van. */
export async function isAssignedToJob(
    job: { companyId: string; techId: string | null; vanId: string | null },
    userId: string,
): Promise<boolean> {
    if (job.techId === userId) return true;
    if (!job.vanId) return false;
    const membership = await prisma.vanMember.findFirst({
        where: { userId, vanId: job.vanId, van: { companyId: job.companyId } },
        select: { id: true },
    });
    return !!membership;
}
