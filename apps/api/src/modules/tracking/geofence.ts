import { prisma } from '@fieldio/database';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';

const ARRIVAL_RADIUS_M = 120;
const DEPART_RADIUS_M = 300;

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6_371_000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const sin1 = Math.sin(dLat / 2);
    const sin2 = Math.sin(dLng / 2);
    const c = 2 * Math.atan2(
        Math.sqrt(sin1 * sin1 + sin2 * sin2 * Math.cos(lat1) * Math.cos(lat2)),
        Math.sqrt(1 - (sin1 * sin1 + sin2 * sin2 * Math.cos(lat1) * Math.cos(lat2)))
    );
    return R * c;
};

/**
 * Called after every persisted location ping. Auto-transitions EN_ROUTE -> ON_SITE
 * when tech enters geofence; ON_SITE -> COMPLETED is left manual (so techs sign off explicitly).
 */
export const evaluateGeofence = async (params: { companyId: string; userId: string; lat: number; lng: number }) => {
    const activeJobs = await prisma.job.findMany({
        where: {
            companyId: params.companyId,
            techId: params.userId,
            deletedAt: null,
            status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
        },
        include: { property: { select: { geoLat: true, geoLng: true } } },
    });

    for (const job of activeJobs) {
        const lat = job.property.geoLat;
        const lng = job.property.geoLng;
        if (lat == null || lng == null) continue;
        const distance = haversine({ lat: params.lat, lng: params.lng }, { lat, lng });

        // ENTER: within radius → ON_SITE
        if (distance <= ARRIVAL_RADIUS_M && job.status !== 'ON_SITE') {
            const newStatus = 'ON_SITE';
            await prisma.job.update({
                where: { id: job.id },
                data: { status: newStatus, actualStart: job.actualStart ?? new Date(), arrivedNotifiedAt: new Date() },
            });
            await prisma.geofenceEvent.create({
                data: {
                    companyId: params.companyId,
                    jobId: job.id,
                    userId: params.userId,
                    type: 'ENTERED',
                    lat: params.lat,
                    lng: params.lng,
                    distanceM: distance,
                },
            });
            await prisma.jobTimelineEvent.create({
                data: {
                    companyId: params.companyId,
                    jobId: job.id,
                    type: 'GEOFENCE_ENTER',
                    message: `Tech arrived on-site (~${Math.round(distance)}m).`,
                    actorId: params.userId,
                },
            });
            await notificationService.notifyCustomer(job.customerId, params.companyId, 'JOB_STARTED', {});
            socketService.emitToCompany(params.companyId, 'schedule:updated', { id: job.id, status: newStatus });
        }

        // EXIT: beyond depart radius after being ON_SITE → log event (no status change)
        if (distance >= DEPART_RADIUS_M && job.status === 'ON_SITE') {
            await prisma.geofenceEvent.create({
                data: {
                    companyId: params.companyId,
                    jobId: job.id,
                    userId: params.userId,
                    type: 'EXITED',
                    lat: params.lat,
                    lng: params.lng,
                    distanceM: distance,
                },
            });
            await prisma.jobTimelineEvent.create({
                data: {
                    companyId: params.companyId,
                    jobId: job.id,
                    type: 'GEOFENCE_EXIT',
                    message: `Tech left site (${Math.round(distance)}m).`,
                    actorId: params.userId,
                },
            });
        }
    }
};
