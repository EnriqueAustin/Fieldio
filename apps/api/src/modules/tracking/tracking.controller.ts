import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma } from '@fieldio/database';
import { socketService } from '../../services/socket.service';
import { evaluateGeofence } from './geofence';

const pingSchema = z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().optional(),
});

export const trackingController = {
    /**
     * Technician's device pings their location. Broadcasts to dispatchers via socket.
     * We persist sparsely — only one ping per ~30s — to keep the table small.
     */
    ping: async (req: Request, res: Response) => {
        const body = pingSchema.parse(req.body);
        const userId = req.user!.userId;
        const companyId = req.user!.companyId;

        // Throttle: only persist if the latest ping is older than 30s.
        const recent = await prisma.userLocationPing.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        const shouldPersist = !recent || Date.now() - recent.createdAt.getTime() > 30_000;

        if (shouldPersist) {
            await prisma.userLocationPing.create({
                data: { userId, companyId, lat: body.lat, lng: body.lng, accuracy: body.accuracy },
            });
            // Fire-and-forget geofence evaluation
            evaluateGeofence({ companyId, userId, lat: body.lat, lng: body.lng }).catch(() => undefined);
        }

        socketService.emitToCompany(companyId, 'tech:location', {
            userId,
            lat: body.lat,
            lng: body.lng,
            accuracy: body.accuracy,
            at: new Date().toISOString(),
        });

        res.status(StatusCodes.NO_CONTENT).send();
    },

    /**
     * Latest position per technician — for dispatcher map view.
     */
    latest: async (req: Request, res: Response) => {
        const companyId = req.user!.companyId;
        // Pull last 24h of pings, group client-side to latest per user.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pings = await prisma.userLocationPing.findMany({
            where: { companyId, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });
        const seen = new Set<string>();
        const latest = [];
        for (const p of pings) {
            if (seen.has(p.userId)) continue;
            seen.add(p.userId);
            latest.push(p);
        }

        const activeJobs = await prisma.job.findMany({
            where: {
                companyId,
                techId: { in: latest.map((ping) => ping.userId) },
                status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
            },
            include: {
                customer: { select: { name: true } },
                property: { select: { addressLine1: true, city: true, geoLat: true, geoLng: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const jobByTech = new Map(activeJobs.map((job) => [job.techId, job]));

        res.json({
            status: 'success',
            data: {
                pings: latest.map((ping) => {
                    const activeJob = jobByTech.get(ping.userId);
                    return {
                        id: ping.id,
                        userId: ping.userId,
                        lat: ping.lat,
                        lng: ping.lng,
                        accuracy: ping.accuracy,
                        createdAt: ping.createdAt,
                        isStale: Date.now() - ping.createdAt.getTime() > 15 * 60 * 1000,
                        user: ping.user,
                        activeJob: activeJob
                            ? {
                                  id: activeJob.id,
                                  title: activeJob.title,
                                  status: activeJob.status,
                                  scheduledStart: activeJob.scheduledStart,
                                  customerName: activeJob.customer.name,
                                  address: `${activeJob.property.addressLine1}, ${activeJob.property.city}`,
                                  destination:
                                      activeJob.property.geoLat != null &&
                                      activeJob.property.geoLng != null
                                      ? {
                                            lat: activeJob.property.geoLat,
                                            lng: activeJob.property.geoLng,
                                        }
                                      : null,
                              }
                            : null,
                    };
                }),
            },
        });
    },

    /**
     * Route playback for a single technician over a date range.
     * Returns: pings (route polyline), jobs worked (with actualStart/actualEnd),
     * geofence events, time-on-site totals.
     */
    playback: async (req: Request, res: Response) => {
        const companyId = req.user!.companyId;
        const userId = req.params.userId;
        const dayStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const start = new Date(`${dayStr}T00:00:00.000Z`);
        const end = new Date(`${dayStr}T23:59:59.999Z`);

        const [pings, jobs, geofence] = await Promise.all([
            prisma.userLocationPing.findMany({
                where: { companyId, userId, createdAt: { gte: start, lte: end } },
                orderBy: { createdAt: 'asc' },
                select: { id: true, lat: true, lng: true, createdAt: true, accuracy: true },
            }),
            prisma.job.findMany({
                where: {
                    companyId, techId: userId,
                    deletedAt: null,
                    OR: [
                        { actualStart: { gte: start, lte: end } },
                        { scheduledStart: { gte: start, lte: end } },
                    ],
                },
                include: {
                    customer: { select: { name: true } },
                    property: { select: { addressLine1: true, city: true, geoLat: true, geoLng: true } },
                },
                orderBy: { scheduledStart: 'asc' },
            }),
            prisma.geofenceEvent.findMany({
                where: { companyId, userId, createdAt: { gte: start, lte: end } },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const jobSummaries = jobs.map((j) => {
            let onSiteMs: number | null = null;
            if (j.actualStart && j.actualEnd) {
                onSiteMs = j.actualEnd.getTime() - j.actualStart.getTime();
            }
            return {
                id: j.id,
                title: j.title,
                status: j.status,
                customer: j.customer.name,
                address: `${j.property.addressLine1}, ${j.property.city}`,
                destination: j.property.geoLat != null && j.property.geoLng != null
                    ? { lat: j.property.geoLat, lng: j.property.geoLng } : null,
                scheduledStart: j.scheduledStart,
                scheduledEnd: j.scheduledEnd,
                actualStart: j.actualStart,
                actualEnd: j.actualEnd,
                onSiteMinutes: onSiteMs ? Math.round(onSiteMs / 60000) : null,
            };
        });

        const totalOnSiteMin = jobSummaries.reduce((s, j) => s + (j.onSiteMinutes ?? 0), 0);

        res.json({
            status: 'success',
            data: {
                userId,
                date: dayStr,
                pings,
                jobs: jobSummaries,
                geofence,
                totals: {
                    jobsWorked: jobSummaries.length,
                    onSiteMinutes: totalOnSiteMin,
                    pingsRecorded: pings.length,
                },
            },
        });
    },

    /** List all techs that have any pings or jobs on a given date. */
    activeTechs: async (req: Request, res: Response) => {
        const companyId = req.user!.companyId;
        const dayStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const start = new Date(`${dayStr}T00:00:00.000Z`);
        const end = new Date(`${dayStr}T23:59:59.999Z`);

        const [pingUserIds, jobUserIds] = await Promise.all([
            prisma.userLocationPing.findMany({
                where: { companyId, createdAt: { gte: start, lte: end } },
                select: { userId: true },
                distinct: ['userId'],
            }),
            prisma.job.findMany({
                where: {
                    companyId, deletedAt: null,
                    techId: { not: null },
                    OR: [
                        { actualStart: { gte: start, lte: end } },
                        { scheduledStart: { gte: start, lte: end } },
                    ],
                },
                select: { techId: true },
                distinct: ['techId'],
            }),
        ]);

        const ids = Array.from(new Set([
            ...pingUserIds.map(p => p.userId),
            ...jobUserIds.map(j => j.techId!).filter(Boolean),
        ]));

        if (ids.length === 0) return void res.json({ status: 'success', data: { techs: [] } });

        const users = await prisma.user.findMany({
            where: { companyId, id: { in: ids } },
            select: { id: true, email: true, firstName: true, lastName: true },
        });
        res.json({ status: 'success', data: { techs: users } });
    },
};
