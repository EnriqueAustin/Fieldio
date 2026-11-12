import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { buildGoogleMapsRouteUrl, estimateLiveEta, planRoute, ROUTE_ESTIMATE } from './route-planner';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';
import { config } from '../../config/env';
import { PUBLIC_USER_SELECT } from '../../utils/publicSelects';

const createJobSchema = z.object({
    customerId: z.string(),
    propertyId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    scheduledStart: z.string().or(z.date()),
    scheduledEnd: z.string().or(z.date()),
    techId: z.string().optional(),
    vanId: z.string().optional().nullable(),
});

const updateJobScheduleSchema = z.object({
    scheduledStart: z.string().or(z.date()).optional(),
    scheduledEnd: z.string().or(z.date()).optional(),
    techId: z.string().optional().nullable(),
    vanId: z.string().optional().nullable(),
});

export const schedulingService = {
    /** Jobs waiting for dispatcher action — sidebar list. */
    getUnscheduled: async (companyId: string) => {
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                OR: [
                    { techId: null, vanId: null },
                    { scheduledStart: null },
                    { status: 'REQUESTED' },
                ],
            },
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                property: { select: { addressLine1: true, city: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: 100,
        });
        return jobs.map((j) => ({
            id: j.id,
            title: j.title,
            priority: j.priority,
            customerName: j.customer.name,
            customerPhone: j.customer.phone,
            address: `${j.property.addressLine1}, ${j.property.city}`,
            requiredSkills: j.requiredSkills,
            createdAt: j.createdAt,
            scheduledStart: j.scheduledStart,
            techId: j.techId,
            status: j.status,
        }));
    },

    getEvents: async (companyId: string, start: string, end: string, branchId?: string) => {
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                ...(branchId ? { branchId } : {}),
                scheduledStart: {
                    gte: new Date(start),
                    lte: new Date(end),
                }
            },
            include: {
                customer: { select: { name: true } },
                property: { select: { addressLine1: true, city: true } },
                tech: { select: { id: true, email: true, avatarUrl: true } },
                van: { select: { id: true, name: true } },
            }
        });

        // Transform to FullCalendar Events
        return jobs.map(job => ({
            id: job.id,
            title: `${job.title} - ${job.customer.name}`,
            start: job.scheduledStart,
            end: job.scheduledEnd,
            resourceId: job.vanId || job.techId || 'unassigned',
            extendedProps: {
                customerId: job.customerId,
                techId: job.techId,
                vanId: job.vanId,
                vanName: (job as any).van?.name,
                status: job.status,
                address: `${job.property.addressLine1}, ${job.property.city}`
            },
            backgroundColor: job.techId || job.vanId ? '#3b82f6' : '#9ca3af',
        }));
    },

    createJob: async (companyId: string, input: z.infer<typeof createJobSchema>) => {
        const job = await prisma.job.create({
            data: {
                companyId,
                ...input,
                status: input.techId ? 'ASSIGNED' : 'REQUESTED'
            },
            include: { customer: true, tech: { select: PUBLIC_USER_SELECT } }
        });

        socketService.emitToCompany(companyId, 'job:created', job);
        return job;
    },

    getMyWeek: async (companyId: string, userId: string, start: string, end: string) => {
        const vanMembership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            select: { vanId: true },
        });

        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                scheduledStart: { gte: new Date(start) },
                scheduledEnd: { lte: new Date(end) },
                OR: [
                    { techId: userId },
                    ...(vanMembership ? [{ vanId: vanMembership.vanId }] : []),
                ],
            },
            include: {
                customer: { select: { name: true, phone: true } },
                property: { select: { addressLine1: true, city: true } },
                van: { select: { id: true, name: true } },
            },
            orderBy: { scheduledStart: 'asc' },
        });

        return jobs.map(job => ({
            id: job.id,
            title: `${job.title} - ${job.customer.name}`,
            start: job.scheduledStart,
            end: job.scheduledEnd,
            extendedProps: {
                status: job.status,
                priority: job.priority,
                customerName: job.customer.name,
                customerPhone: job.customer.phone,
                address: `${job.property.addressLine1}, ${job.property.city}`,
                vanName: job.van?.name,
            },
            backgroundColor:
                job.status === 'COMPLETED' ? '#10b981' :
                job.status === 'ON_SITE' ? '#f59e0b' :
                job.status === 'EN_ROUTE' ? '#8b5cf6' :
                '#3b82f6',
        }));
    },

    updateSchedule: async (jobId: string, companyId: string, input: z.infer<typeof updateJobScheduleSchema>) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // A finished or cancelled job is off the board — a calendar drag must not
        // resurrect it. Reopening is an explicit office action with its own route.
        if (job.status === 'COMPLETED' || job.status === 'CANCELED') {
            throw new AppError(`Cannot reschedule a ${job.status.toLowerCase()} job`, StatusCodes.CONFLICT);
        }

        // Who/what the job will be assigned to after this change.
        const nextTechId = input.techId !== undefined ? input.techId : job.techId;
        const nextVanId = input.vanId !== undefined ? input.vanId : job.vanId;

        // Conflict detection on both the tech and the van when a time window is set.
        if (input.scheduledStart && input.scheduledEnd) {
            const start = new Date(input.scheduledStart);
            const end = new Date(input.scheduledEnd);
            const overlap = {
                companyId,
                id: { not: job.id },
                deletedAt: null,
                status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] as ('ASSIGNED' | 'EN_ROUTE' | 'ON_SITE')[] },
                AND: [
                    { scheduledStart: { lt: end } },
                    { scheduledEnd: { gt: start } },
                ],
            };
            if (nextTechId) {
                const conflict = await prisma.job.findFirst({
                    where: { ...overlap, techId: nextTechId },
                    select: { id: true, title: true },
                });
                if (conflict) throw new AppError(`Tech is already booked: "${conflict.title}"`, StatusCodes.CONFLICT);
            }
            if (nextVanId) {
                const conflict = await prisma.job.findFirst({
                    where: { ...overlap, vanId: nextVanId },
                    select: { id: true, title: true },
                });
                if (conflict) throw new AppError(`Van is already booked: "${conflict.title}"`, StatusCodes.CONFLICT);
            }
        }

        // Whitelist the writable fields — never let an arbitrary `...input` key
        // (e.g. status, companyId) through. A reschedule only touches the time
        // window and the assignment.
        const data: Record<string, unknown> = {};
        if (input.scheduledStart !== undefined) {
            data.scheduledStart = input.scheduledStart ? new Date(input.scheduledStart) : null;
        }
        if (input.scheduledEnd !== undefined) {
            data.scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
        }
        if (input.techId !== undefined) data.techId = input.techId;
        if (input.vanId !== undefined) data.vanId = input.vanId;

        // Status is only ever nudged REQUESTED → ASSIGNED, when the drag assigns a
        // tech/van to a still-unassigned job. An EN_ROUTE / ON_SITE job keeps its
        // live status (COMPLETED / CANCELED were refused above).
        if (job.status === 'REQUESTED' && (nextTechId || nextVanId)) {
            data.status = 'ASSIGNED';
        }

        const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data,
            include: { tech: { select: PUBLIC_USER_SELECT }, customer: true }
        });

        socketService.emitToCompany(companyId, 'schedule:updated', updatedJob);
        return updatedJob;
    },

    /** Suggest the best techs for a job: skill match + free time slot. */
    suggestTechs: async (jobId: string, companyId: string) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const required = job.requiredSkills ?? [];
        const techs = await prisma.user.findMany({
            where: { companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true, skills: true, email: true, avatarUrl: true },
        });

        // Count conflicts in scheduled window
        const candidates = await Promise.all(
            techs.map(async (t) => {
                const skillCoverage = required.length === 0
                    ? 1
                    : required.filter((s) => t.skills.includes(s)).length / required.length;
                let conflicts = 0;
                if (job.scheduledStart && job.scheduledEnd) {
                    conflicts = await prisma.job.count({
                        where: {
                            companyId,
                            id: { not: job.id },
                            deletedAt: null,
                            techId: t.id,
                            status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
                            AND: [
                                { scheduledStart: { lt: job.scheduledEnd } },
                                { scheduledEnd: { gt: job.scheduledStart } },
                            ],
                        },
                    });
                }
                const score = skillCoverage * 100 - conflicts * 50;
                return {
                    techId: t.id,
                    name: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email,
                    avatarUrl: t.avatarUrl,
                    skills: t.skills,
                    skillCoverage,
                    conflicts,
                    score,
                };
            })
        );
        candidates.sort((a, b) => b.score - a.score);
        return { requiredSkills: required, candidates };
    },

    /** Customer-facing tracker token + send "On my way" SMS. */
    onMyWay: async (jobId: string, companyId: string) => {
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId },
            include: { tech: { select: PUBLIC_USER_SELECT }, customer: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        if (!job.tech) throw new AppError('Job has no tech assigned', StatusCodes.BAD_REQUEST);

        const token = job.customerTrackingToken ?? crypto.randomBytes(20).toString('hex');
        const trackingUrl = `${config.WEB_URL}/track/${token}`;
        const techName = [job.tech.firstName, job.tech.lastName].filter(Boolean).join(' ') || 'Your technician';

        await prisma.job.update({
            where: { id: job.id },
            data: { status: 'EN_ROUTE', customerTrackingToken: token, onMyWaySentAt: new Date() },
        });

        await prisma.jobTimelineEvent.create({
            data: { companyId, jobId: job.id, type: 'EN_ROUTE', message: `${techName} marked en route` },
        });

        await notificationService.notifyCustomer(job.customerId, companyId, 'JOB_EN_ROUTE', {
            techName,
            trackingUrl,
        });

        socketService.emitToCompany(companyId, 'schedule:updated', { id: job.id, status: 'EN_ROUTE' });
        return { trackingUrl, token };
    },

    /** Public, unauthenticated tracking view. */
    getTracking: async (token: string) => {
        const job = await prisma.job.findFirst({
            where: { customerTrackingToken: token },
            include: {
                tech: { select: { firstName: true, lastName: true, avatarUrl: true } },
                customer: { select: { name: true } },
                property: { select: { addressLine1: true, city: true, geoLat: true, geoLng: true } },
                company: { select: { name: true } },
            },
        });
        if (!job) throw new AppError('Tracker not found', StatusCodes.NOT_FOUND);

        // Latest ping for the tech
        let lastPing: { lat: number; lng: number; createdAt: Date } | null = null;
        if (job.techId) {
            const p = await prisma.userLocationPing.findFirst({
                where: { userId: job.techId, companyId: job.companyId },
                orderBy: { createdAt: 'desc' },
                select: { lat: true, lng: true, createdAt: true },
            });
            lastPing = p;
        }
        // Straight-line estimate only while the tech is actually driving here and
        // the ping is fresh; otherwise `basis: 'none'` and the page shows no ETA.
        const eta = estimateLiveEta({
            status: job.status,
            ping: lastPing,
            site: job.property ? { lat: job.property.geoLat, lng: job.property.geoLng } : null,
        });
        return {
            job: {
                id: job.id,
                title: job.title,
                status: job.status,
                scheduledStart: job.scheduledStart,
                techName: [job.tech?.firstName, job.tech?.lastName].filter(Boolean).join(' '),
                techAvatar: job.tech?.avatarUrl,
            },
            customer: job.customer,
            property: job.property,
            company: job.company,
            // The tracker link outlives the visit; only reveal where the tech is
            // while they are driving to this customer.
            techLocation: job.status === 'EN_ROUTE' ? lastPing : null,
            eta,
        };
    },

    /**
     * A technician's open jobs for one day in a suggested visiting order, with
     * approximate per-leg distance/drive time and a Google Maps route link.
     * Covers jobs assigned to the tech directly and to their active van crew.
     * Never selects pricing.
     */
    /** Company-scoped user lookup so office roles can't read another company's tech. */
    findCompanyUser: (companyId: string, userId: string) =>
        prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true } }),

    getDayRoute: async (companyId: string, techId: string, date: string, tzOffsetMin: number) => {
        const [y, m, d] = date.split('-').map(Number);
        const dayStart = new Date(Date.UTC(y, m - 1, d) - tzOffsetMin * 60_000);
        const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

        const vanMembership = await prisma.vanMember.findFirst({
            where: { userId: techId, van: { companyId, active: true } },
            select: { vanId: true },
        });

        const jobSelect = {
            id: true,
            title: true,
            status: true,
            priority: true,
            scheduledStart: true,
            scheduledEnd: true,
            techId: true,
            vanId: true,
            customer: { select: { name: true } },
            property: { select: { addressLine1: true, city: true, geoLat: true, geoLng: true } },
        } as const;
        const baseWhere = {
            companyId,
            deletedAt: null,
            status: { notIn: ['COMPLETED', 'CANCELED'] as ('COMPLETED' | 'CANCELED')[] },
            scheduledStart: { gte: dayStart, lt: dayEnd },
        };
        // Two plain queries rather than an OR so each assignment path is explicit.
        const [own, crew] = await Promise.all([
            prisma.job.findMany({ where: { ...baseWhere, techId }, select: jobSelect }),
            vanMembership
                ? prisma.job.findMany({ where: { ...baseWhere, vanId: vanMembership.vanId }, select: jobSelect })
                : Promise.resolve([]),
        ]);
        const jobs = [...new Map([...own, ...crew].map((j) => [j.id, j])).values()];

        const ping = await prisma.userLocationPing.findFirst({
            where: { userId: techId, companyId, createdAt: { gte: dayStart, lt: dayEnd } },
            orderBy: { createdAt: 'desc' },
            select: { lat: true, lng: true, createdAt: true },
        });
        const origin = ping ? { lat: ping.lat, lng: ping.lng } : null;

        const plan = planRoute(
            jobs.map((j) => ({
                id: j.id,
                lat: j.property?.geoLat ?? null,
                lng: j.property?.geoLng ?? null,
                scheduledStart: j.scheduledStart,
                scheduledEnd: j.scheduledEnd,
                inProgress: j.status === 'EN_ROUTE' || j.status === 'ON_SITE',
                job: j,
            })),
            origin,
        );

        const maps = buildGoogleMapsRouteUrl(
            origin,
            plan.stops.filter((s) => !s.noLocation).map((s) => ({ lat: s.stop.lat!, lng: s.stop.lng! })),
        );

        return {
            date,
            techId,
            origin: ping ? { lat: ping.lat, lng: ping.lng, source: 'lastPing' as const, at: ping.createdAt } : null,
            stops: plan.stops.map(({ stop, order, kind, noLocation, leg }) => ({
                order,
                jobId: stop.job.id,
                title: stop.job.title,
                status: stop.job.status,
                priority: stop.job.priority,
                customerName: stop.job.customer?.name ?? null,
                address: [stop.job.property?.addressLine1, stop.job.property?.city].filter(Boolean).join(', '),
                scheduledStart: stop.job.scheduledStart,
                scheduledEnd: stop.job.scheduledEnd,
                kind,
                noLocation,
                lat: stop.lat,
                lng: stop.lng,
                leg,
            })),
            totals: {
                stops: plan.stops.length,
                located: plan.stops.filter((s) => !s.noLocation).length,
                distanceKm: plan.totalDistanceKm,
                driveMinutes: plan.totalDriveMinutes,
            },
            mapsUrl: maps?.url ?? null,
            mapsTruncated: maps?.truncated ?? false,
            estimate: {
                approximate: true,
                avgSpeedKmh: ROUTE_ESTIMATE.AVG_SPEED_KMH,
                legBufferMin: ROUTE_ESTIMATE.LEG_BUFFER_MIN,
            },
        };
    },
};
