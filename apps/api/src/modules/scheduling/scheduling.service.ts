import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';
import { config } from '../../config/env';

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
            include: { customer: true, tech: true }
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
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // Conflict detection if reschedule with a new time + tech
        if (input.scheduledStart && input.scheduledEnd && (input.techId || job.techId)) {
            const techId = input.techId ?? job.techId!;
            const conflict = await prisma.job.findFirst({
                where: {
                    companyId,
                    id: { not: job.id },
                    deletedAt: null,
                    techId,
                    status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
                    AND: [
                        { scheduledStart: { lt: new Date(input.scheduledEnd) } },
                        { scheduledEnd: { gt: new Date(input.scheduledStart) } },
                    ],
                },
                select: { id: true, title: true, scheduledStart: true, scheduledEnd: true },
            });
            if (conflict) throw new AppError(`Tech is already booked: "${conflict.title}"`, StatusCodes.CONFLICT);
        }

        const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data: {
                ...input,
                status: input.techId ? 'ASSIGNED' : (job.techId ? 'ASSIGNED' : 'REQUESTED')
            },
            include: { tech: true, customer: true }
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
            include: { tech: true, customer: true },
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
                where: { userId: job.techId },
                orderBy: { createdAt: 'desc' },
                select: { lat: true, lng: true, createdAt: true },
            });
            lastPing = p;
        }
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
            techLocation: lastPing,
        };
    },
};
