import { prisma } from '@fieldio/database';
import { buildGoogleMapsRouteUrl, planRoute, ROUTE_ESTIMATE } from './route-planner';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';
import { config } from '../../config/env';
import { PUBLIC_USER_SELECT } from '../../utils/publicSelects';
import { logger } from '../../utils/logger';
import { formatInTimeZone, getCompanyTimezone } from '../../utils/timezone';
import { jobsService } from '../jobs/jobs.service';
import { normalizeCompanySettings } from '../company/company-settings';
import { latestFixForJob } from '../tracking/job-location';
import { estimateEtaMinutes, haversineKm } from '../../utils/eta';
import { jobPushLink, jobRemovedPushLink } from '../../utils/push-link';
import { previousAssignees } from '../../utils/reassignment';

const createJobSchema = z.object({
    customerId: z.string().min(1),
    propertyId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    scheduledStart: z.string().datetime().or(z.date()),
    scheduledEnd: z.string().datetime().or(z.date()),
    techId: z.string().min(1).optional().nullable(),
    vanId: z.string().min(1).optional().nullable(),
});

const updateJobScheduleSchema = z.object({
    // Dates must be valid ISO datetimes — a bad string is a 400, not a 500 when
    // `new Date()` later yields `Invalid Date`.
    scheduledStart: z.string().datetime().or(z.date()).optional().nullable(),
    scheduledEnd: z.string().datetime().or(z.date()).optional().nullable(),
    techId: z.string().optional().nullable(),
    vanId: z.string().optional().nullable(),
});

/** Company-scoped assignee checks shared by create + reschedule. */
async function assertAssigneesInCompany(
    companyId: string,
    assignees: { techId?: string | null; vanId?: string | null },
) {
    if (assignees.techId) {
        const tech = await prisma.user.findFirst({
            where: { id: assignees.techId, companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            select: { id: true },
        });
        if (!tech) throw new AppError('Technician not found', StatusCodes.NOT_FOUND);
    }
    if (assignees.vanId) {
        const van = await prisma.van.findFirst({
            where: { id: assignees.vanId, companyId, active: true },
            select: { id: true },
        });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);
    }
}

// Recurring-generated and booking-converted jobs can have no end. Wherever a
// window matters (conflicts, the tech's week, the board) such a job occupies a
// default 60-minute slot instead of vanishing or never clashing.
const DEFAULT_SLOT_MS = 60 * 60 * 1000;
/** The public tracker never shows a fix older than this (e.g. from a previous trip). */
const TRACKER_FIX_MAX_AGE_MS = 30 * 60_000;

export type TimeWindow = { start: Date; end: Date };
type Scheduled = { scheduledStart: Date | null; scheduledEnd: Date | null };

const effectiveEnd = (start: Date, end: Date | null | undefined) =>
    end ?? new Date(start.getTime() + DEFAULT_SLOT_MS);

const sameInstant = (a: Date | null | undefined, b: Date | null | undefined) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Prisma pre-filter for jobs whose window overlaps [start, end): starts before
 * the range ends and (defaulted) ends after it starts — so a multi-day job that
 * straddles the range matches too, and a null-end job counts as one hour.
 */
const overlapsWindowWhere = (w: TimeWindow) => ({
    scheduledStart: { lt: w.end },
    OR: [
        { scheduledEnd: { gt: w.start } },
        { scheduledEnd: null, scheduledStart: { gt: new Date(w.start.getTime() - DEFAULT_SLOT_MS) } },
    ],
});

/** The same overlap rule applied to a loaded row (exact re-check after the pre-filter). */
const overlapsWindow = (job: Scheduled, w: TimeWindow) =>
    !!job.scheduledStart &&
    job.scheduledStart.getTime() < w.end.getTime() &&
    effectiveEnd(job.scheduledStart, job.scheduledEnd).getTime() > w.start.getTime();

// Statuses that hold a slot on someone's day. PAUSED is a multi-day job the
// crew left overnight — still theirs, still booked.
type BookedStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'PAUSED';
const BOOKED_STATUSES: BookedStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'PAUSED'];

/**
 * Double-booking guard for a job's effective window. A tech is busy when they
 * hold a direct job or a van they crew is booked; a van is busy when it holds a
 * job or one of its crew holds a direct job — the same rule suggestTechs scores.
 */
export async function assertNoScheduleConflict(
    companyId: string,
    jobId: string | null, // null for a job not created yet
    w: TimeWindow,
    assignees: { techId: string | null; vanId: string | null },
) {
    const { techId, vanId } = assignees;
    if (!techId && !vanId) return;

    const [techVans, vanCrew] = await Promise.all([
        techId
            ? prisma.vanMember.findMany({
                where: { userId: techId, van: { companyId, active: true } },
                select: { vanId: true },
            })
            : Promise.resolve([] as { vanId: string }[]),
        vanId
            ? prisma.vanMember.findMany({
                where: { vanId, van: { companyId, active: true } },
                select: { userId: true },
            })
            : Promise.resolve([] as { userId: string }[]),
    ]);
    const techVanIds = techVans.map((v) => v.vanId);
    const crewIds = vanCrew.map((m) => m.userId);

    const assigneeOr = [
        ...(techId ? [{ techId }] : []),
        ...(techVanIds.length ? [{ vanId: { in: techVanIds } }] : []),
        ...(vanId ? [{ vanId }] : []),
        ...(crewIds.length ? [{ techId: { in: crewIds } }] : []),
    ];
    const candidates = await prisma.job.findMany({
        where: {
            companyId,
            ...(jobId ? { id: { not: jobId } } : {}),
            deletedAt: null,
            status: { in: BOOKED_STATUSES },
            AND: [overlapsWindowWhere(w), { OR: assigneeOr }],
        },
        select: { id: true, title: true, techId: true, vanId: true, scheduledStart: true, scheduledEnd: true },
    });
    const clashing = candidates.filter((c) => overlapsWindow(c, w));

    const conflict = (message: string): never => {
        throw new AppError(message, StatusCodes.CONFLICT);
    };
    if (techId) {
        const own = clashing.find((c) => c.techId === techId);
        if (own) conflict(`Tech is already booked: "${own.title}"`);
        const viaVan = clashing.find((c) => c.vanId && techVanIds.includes(c.vanId));
        if (viaVan) conflict(`Tech's van is already booked: "${viaVan.title}"`);
    }
    if (vanId) {
        const own = clashing.find((c) => c.vanId === vanId);
        if (own) conflict(`Van is already booked: "${own.title}"`);
        const viaCrew = clashing.find((c) => c.techId && crewIds.includes(c.techId));
        if (viaCrew) conflict(`A van crew member is already booked: "${viaCrew.title}"`);
    }
}

type AssignmentSnapshot = Scheduled & { techId: string | null; vanId: string | null };

/**
 * In-app + socket heads-up (never SMS) to the people whose day just changed:
 * whoever is newly on the job (tech or van crew), whoever was taken off it, and
 * — when only the time moved — the people still on it. Best-effort: the
 * schedule write already landed, so a failure is logged, never thrown.
 */
async function notifyScheduleChange(
    companyId: string,
    job: { id: string; title: string },
    before: AssignmentSnapshot | null,
    after: AssignmentSnapshot,
) {
    try {
        const crewOf = async (vanId: string | null | undefined) =>
            vanId
                ? (await prisma.vanMember.findMany({
                    where: { vanId, van: { companyId } },
                    select: { userId: true },
                })).map((m) => m.userId)
                : [];
        const [beforeCrew, afterCrew] = await Promise.all([crewOf(before?.vanId), crewOf(after.vanId)]);
        const peopleOn = (techId: string | null | undefined, crew: string[]) =>
            new Set([techId, ...crew].filter((id): id is string => !!id));
        const beforeIds = peopleOn(before?.techId, beforeCrew);
        const afterIds = peopleOn(after.techId, afterCrew);
        if (beforeIds.size === 0 && afterIds.size === 0) return;

        const timeMoved = !!before && (
            !sameInstant(before.scheduledStart, after.scheduledStart) ||
            !sameInstant(before.scheduledEnd, after.scheduledEnd)
        );
        const when = after.scheduledStart
            ? formatInTimeZone(after.scheduledStart, await getCompanyTimezone(companyId))
            : 'no time set';

        const sends: Promise<unknown>[] = [];
        for (const userId of afterIds) {
            if (!beforeIds.has(userId)) {
                sends.push(notificationService.notifyUser(
                    userId, companyId, 'JOB_ASSIGNED', 'New job assigned', `${job.title} → ${when}`, jobPushLink(job.id),
                ));
            } else if (timeMoved) {
                sends.push(notificationService.notifyUser(
                    userId, companyId, 'ALERT', 'Job moved', `${job.title} → ${when}`, jobPushLink(job.id),
                ));
            }
        }
        for (const userId of beforeIds) {
            if (!afterIds.has(userId)) {
                sends.push(notificationService.notifyUser(
                    userId, companyId, 'ALERT', 'Job reassigned', `${job.title} is no longer on your schedule`, jobRemovedPushLink(job.id),
                ));
            }
        }
        await Promise.all(sends);
    } catch (err) {
        logger.warn(
            { jobId: job.id, err: err instanceof Error ? err.message : String(err) },
            'Schedule change notification failed',
        );
    }
}

// Dispatch-board status → colour, consumed by the web calendar.
const STATUS_COLORS: Record<string, string> = {
    REQUESTED: '#9ca3af',
    ASSIGNED: '#3b82f6',
    EN_ROUTE: '#8b5cf6',
    ON_SITE: '#f59e0b',
    PAUSED: '#f97316',
    COMPLETED: '#10b981',
    CANCELED: '#cbd5e1',
};

export const schedulingService = {
    /** Jobs waiting for dispatcher action — sidebar list. */
    getUnscheduled: async (companyId: string) => {
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                // Only live, dispatchable work — never COMPLETED/CANCELED, and
                // EN_ROUTE/ON_SITE jobs are already being worked, not waiting.
                status: { in: ['REQUESTED', 'ASSIGNED'] },
                OR: [
                    { techId: null, vanId: null },
                    { scheduledStart: null },
                ],
            },
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                property: { select: { addressLine1: true, city: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: 100,
        });
        // "Needs dispatcher action" = missing a time or missing an assignee.
        // Enforced here as well so a scheduled, assigned job never lists even if
        // its status lags at REQUESTED (and so the rule holds without the OR).
        return jobs
            .filter((j) => !j.scheduledStart || (!j.techId && !j.vanId))
            .map((j) => ({
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
        const range = { start: new Date(start), end: new Date(end) };
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                ...(branchId ? { branchId } : {}),
                // Overlap, not "starts inside": a multi-day job that began last
                // week still shows on this week's board.
                ...overlapsWindowWhere(range),
            },
            include: {
                customer: { select: { name: true, phone: true } },
                property: { select: { addressLine1: true, city: true } },
                tech: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
                van: { select: { id: true, name: true } },
            }
        });

        // Transform to FullCalendar Events
        return jobs.filter((job) => overlapsWindow(job, range)).map(job => {
            const tech = (job as any).tech;
            const techName = tech
                ? [tech.firstName, tech.lastName].filter(Boolean).join(' ') ||
                  (tech.email ? tech.email.split('@')[0] : null)
                : null;
            const terminal = job.status === 'COMPLETED' || job.status === 'CANCELED';
            return {
                id: job.id,
                title: `${job.title} - ${job.customer.name}`,
                start: job.scheduledStart,
                // Recurring-generated jobs have no end; default to a 60-minute block
                // so the calendar draws something real.
                end: job.scheduledStart ? effectiveEnd(job.scheduledStart, job.scheduledEnd) : null,
                resourceId: job.vanId || job.techId || 'unassigned',
                // Finished / cancelled jobs can't be dragged on the board.
                editable: !terminal,
                extendedProps: {
                    customerId: job.customerId,
                    customerName: job.customer.name,
                    customerPhone: job.customer.phone,
                    propertyId: job.propertyId,
                    jobTitle: job.title,
                    priority: job.priority,
                    techId: job.techId,
                    techName,
                    vanId: job.vanId,
                    vanName: (job as any).van?.name,
                    status: job.status,
                    address: `${job.property.addressLine1}, ${job.property.city}`
                },
                backgroundColor: STATUS_COLORS[job.status] ?? '#9ca3af',
            };
        });
    },

    createJob: async (companyId: string, rawInput: unknown) => {
        const input = createJobSchema.parse(rawInput);

        const start = new Date(input.scheduledStart);
        const end = new Date(input.scheduledEnd);
        if (!(end.getTime() > start.getTime())) {
            throw new AppError('End must be after start', StatusCodes.BAD_REQUEST);
        }

        // The customer must be ours...
        const customer = await prisma.customer.findFirst({
            where: { id: input.customerId, companyId, deletedAt: null },
            select: { id: true },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        // ...and the property must be ours and belong to that customer.
        const property = await prisma.property.findFirst({
            where: { id: input.propertyId, companyId, customerId: input.customerId },
            select: { id: true },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);

        await assertAssigneesInCompany(companyId, { techId: input.techId, vanId: input.vanId });
        await assertNoScheduleConflict(companyId, null, { start, end }, {
            techId: input.techId ?? null,
            vanId: input.vanId ?? null,
        });

        // Whitelist every column — companyId is forced from the caller's token and
        // can never be set by the body (no tenant move).
        const job = await prisma.job.create({
            data: {
                customerId: input.customerId,
                propertyId: input.propertyId,
                title: input.title,
                description: input.description ?? null,
                scheduledStart: start,
                scheduledEnd: end,
                techId: input.techId ?? null,
                vanId: input.vanId ?? null,
                status: input.techId || input.vanId ? 'ASSIGNED' : 'REQUESTED',
                companyId,
            },
            include: { customer: true, tech: { select: PUBLIC_USER_SELECT } }
        });

        socketService.emitToCompany(companyId, 'job:created', job);
        await notifyScheduleChange(companyId, job, null, job);
        return job;
    },

    getMyWeek: async (companyId: string, userId: string, start: string, end: string) => {
        const range = { start: new Date(start), end: new Date(end) };
        const vanMembership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            select: { vanId: true },
        });
        const isMine = (job: { techId: string | null; vanId: string | null }) =>
            job.techId === userId || (!!vanMembership && job.vanId === vanMembership.vanId);

        // Overlap, not "fits inside": a null-end job (counts as one hour) and a
        // multi-day job straddling the week edge used to vanish from the week.
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                AND: [
                    overlapsWindowWhere(range),
                    {
                        OR: [
                            { techId: userId },
                            ...(vanMembership ? [{ vanId: vanMembership.vanId }] : []),
                        ],
                    },
                ],
            },
            include: {
                customer: { select: { name: true, phone: true } },
                property: { select: { addressLine1: true, city: true } },
                van: { select: { id: true, name: true } },
            },
            orderBy: { scheduledStart: 'asc' },
        });

        return jobs.filter((job) => isMine(job) && overlapsWindow(job, range)).map(job => ({
            id: job.id,
            title: `${job.title} - ${job.customer.name}`,
            start: job.scheduledStart,
            end: job.scheduledStart ? effectiveEnd(job.scheduledStart, job.scheduledEnd) : null,
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
                job.status === 'PAUSED' ? '#f97316' :
                job.status === 'EN_ROUTE' ? '#8b5cf6' :
                '#3b82f6',
        }));
    },

    updateSchedule: async (jobId: string, companyId: string, rawInput: unknown) => {
        const input = updateJobScheduleSchema.parse(rawInput);

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

        // A new assignee must belong to this company (an active tech / active van)
        // — checked before conflict detection so a foreign id is a clean 404.
        await assertAssigneesInCompany(companyId, {
            techId: input.techId !== undefined ? input.techId : undefined,
            vanId: input.vanId !== undefined ? input.vanId : undefined,
        });

        // Unassigning (no tech and no van left): a live job can't be stripped of
        // its crew; an ASSIGNED job falls back to REQUESTED below.
        const willBeUnassigned = !nextTechId && !nextVanId;
        if (willBeUnassigned && (job.status === 'EN_ROUTE' || job.status === 'ON_SITE' || job.status === 'PAUSED')) {
            throw new AppError(
                'Cannot unassign a job that is en route, on site or paused',
                StatusCodes.CONFLICT,
            );
        }

        // Effective window = incoming times, else the job's existing times. Used
        // for both the end>start guard and conflict detection, so assigning a tech
        // with only `{ techId }` is still checked against the job's own slot.
        const effStart = input.scheduledStart !== undefined
            ? (input.scheduledStart ? new Date(input.scheduledStart) : null)
            : job.scheduledStart;
        const effEnd = input.scheduledEnd !== undefined
            ? (input.scheduledEnd ? new Date(input.scheduledEnd) : null)
            : job.scheduledEnd;

        if (effStart && effEnd && !(effEnd.getTime() > effStart.getTime())) {
            throw new AppError('End must be after start', StatusCodes.BAD_REQUEST);
        }

        // Conflict detection on the tech, the van and their crew links whenever a
        // start exists. A missing end counts as a one-hour slot, so a job with
        // no end can still clash (and be clashed with).
        if (effStart) {
            await assertNoScheduleConflict(
                companyId,
                job.id,
                { start: effStart, end: effectiveEnd(effStart, effEnd) },
                { techId: nextTechId, vanId: nextVanId },
            );
        }

        // Whitelist the writable fields — never let an arbitrary `...input` key
        // (e.g. status, companyId) through. A reschedule only touches the time
        // window and the assignment.
        const data: Record<string, unknown> = {};
        if (input.scheduledStart !== undefined) {
            data.scheduledStart = effStart;
            // A new start time needs its own 24h/1h customer reminders — the
            // sweep skips any job whose sent-at flags are already stamped.
            if (!sameInstant(job.scheduledStart, effStart)) {
                data.reminder24hSentAt = null;
                data.reminder1hSentAt = null;
            }
        }
        if (input.scheduledEnd !== undefined) {
            data.scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
        }
        if (input.techId !== undefined) data.techId = input.techId;
        if (input.vanId !== undefined) data.vanId = input.vanId;

        // Status nudges: REQUESTED → ASSIGNED when a tech/van is dropped on an
        // unassigned job; ASSIGNED → REQUESTED when the last assignee is removed.
        // An EN_ROUTE / ON_SITE job keeps its live status (terminal jobs were
        // refused above, and a live unassign was refused above too).
        if (job.status === 'REQUESTED' && (nextTechId || nextVanId)) {
            data.status = 'ASSIGNED';
        } else if (job.status === 'ASSIGNED' && willBeUnassigned) {
            data.status = 'REQUESTED';
        }

        const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data,
            include: { tech: { select: PUBLIC_USER_SELECT }, customer: true }
        });

        socketService.emitToCompany(companyId, 'schedule:updated', {
            ...updatedJob,
            ...previousAssignees(job, updatedJob),
        });
        await notifyScheduleChange(companyId, updatedJob, job, updatedJob);
        return updatedJob;
    },

    /** Suggest the best techs for a job: skill match + free time slot. */
    suggestTechs: async (jobId: string, companyId: string) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const required = job.requiredSkills ?? [];
        const techs = await prisma.user.findMany({
            where: { companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true, skills: true, email: true, avatarUrl: true },
        });
        const techIds = techs.map((t) => t.id);

        // One query for every candidate's overlapping jobs (was an N+1 count per
        // tech), tallied in memory. A tech is also busy when a van they actively
        // crew is booked in the window, so van bookings count too.
        let overlappingJobs: Array<{ techId: string | null; vanId: string | null }> = [];
        const vansByTech = new Map<string, Set<string>>();
        if (job.scheduledStart && techIds.length > 0) {
            const slot = { start: job.scheduledStart, end: effectiveEnd(job.scheduledStart, job.scheduledEnd) };
            const inWindow = await prisma.job.findMany({
                where: {
                    companyId,
                    id: { not: job.id },
                    deletedAt: null,
                    status: { in: BOOKED_STATUSES },
                    ...overlapsWindowWhere(slot),
                },
                select: { techId: true, vanId: true, scheduledStart: true, scheduledEnd: true },
            });
            overlappingJobs = inWindow.filter((o) => overlapsWindow(o, slot));
            const vanMembers = await prisma.vanMember.findMany({
                where: { userId: { in: techIds }, van: { companyId, active: true } },
                select: { userId: true, vanId: true },
            });
            for (const vm of vanMembers) {
                if (!vansByTech.has(vm.userId)) vansByTech.set(vm.userId, new Set());
                vansByTech.get(vm.userId)!.add(vm.vanId);
            }
        }

        const candidates = techs.map((t) => {
            const skillCoverage = required.length === 0
                ? 1
                : required.filter((s) => t.skills.includes(s)).length / required.length;
            const techVans = vansByTech.get(t.id);
            const conflicts = overlappingJobs.filter(
                (o) => o.techId === t.id || (o.vanId && techVans?.has(o.vanId)),
            ).length;
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
        });
        candidates.sort((a, b) => b.score - a.score);
        return { requiredSkills: required, candidates };
    },

    /**
     * "On my way" — kept for older clients and queued offline replays; the field
     * apps now send PATCH /jobs/:id/status EN_ROUTE directly. Guards first, then
     * the status change goes through jobsService.updateStatus, which owns the
     * TRAVEL clock, the tracker token, the stale-replay check and the single
     * customer en-route message.
     */
    onMyWay: async (
        jobId: string,
        companyId: string,
        actor: { userId: string; role: string },
        clientAt?: string,
    ) => {
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId, deletedAt: null },
            select: { id: true, status: true, techId: true, vanId: true, customerTrackingToken: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (actor.role === 'TECHNICIAN' && job.techId !== actor.userId) {
            const crewMate = job.vanId
                ? await prisma.vanMember.findFirst({
                    where: { userId: actor.userId, vanId: job.vanId, van: { companyId } },
                    select: { id: true },
                })
                : null;
            if (!crewMate) {
                throw new AppError('You can only update jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }
        if (!job.techId && !job.vanId) {
            throw new AppError('Job has no tech or van assigned', StatusCodes.BAD_REQUEST);
        }
        if (job.status === 'COMPLETED' || job.status === 'CANCELED') {
            throw new AppError(`Job is already ${job.status.toLowerCase()}`, StatusCodes.CONFLICT);
        }
        if (job.status === 'ON_SITE') {
            throw new AppError('Job is already on site', StatusCodes.CONFLICT);
        }

        const trackingFor = (token: string | null | undefined) => ({
            token: token ?? null,
            trackingUrl: token ? `${config.WEB_URL}/track/${token}` : null,
        });

        // Already en route: a repeat tap must not text the customer again.
        if (job.status === 'EN_ROUTE') return trackingFor(job.customerTrackingToken);

        const updated = await jobsService.updateStatus(
            job.id, companyId, 'EN_ROUTE', actor.userId, clientAt, actor.role,
        );
        return trackingFor(updated?.customerTrackingToken ?? job.customerTrackingToken);
    },

    /** Public, unauthenticated tracking view. */
    getTracking: async (token: string, now: Date = new Date()) => {
        const job = await prisma.job.findFirst({
            where: { customerTrackingToken: token, deletedAt: null },
            include: {
                tech: { select: { firstName: true, avatarUrl: true } },
                customer: { select: { name: true } },
                property: { select: { addressLine1: true, city: true, geoLat: true, geoLng: true } },
                company: { select: { name: true, settings: true } },
            },
        });
        if (!job) throw new AppError('Tracker not found', StatusCodes.NOT_FOUND);

        // The tracker link outlives the visit: only look up — and only ever
        // reveal — where the tech is while they are driving to this customer,
        // and never an old fix from before this trip.
        const enRoute = job.status === 'EN_ROUTE';
        const fix = enRoute ? await latestFixForJob(job) : null;
        const visibleFix =
            fix && now.getTime() - new Date(fix.createdAt).getTime() <= TRACKER_FIX_MAX_AGE_MS ? fix : null;

        const site = job.property ? { lat: job.property.geoLat, lng: job.property.geoLng } : null;
        // Recomputed on every poll; null when the fix is stale or the site isn't geocoded.
        const etaMinutes = enRoute ? estimateEtaMinutes({ fix: visibleFix, destination: site, now }) : null;
        const distanceKm =
            etaMinutes !== null && visibleFix && site?.lat != null && site.lng != null
                ? Math.round(haversineKm(visibleFix, { lat: site.lat, lng: site.lng }) * 10) / 10
                : null;
        const settings = normalizeCompanySettings(job.company?.settings);

        return {
            job: {
                id: job.id,
                title: job.title,
                status: job.status,
                scheduledStart: job.scheduledStart,
                // First name only — the customer never needs the tech's surname.
                techName: job.tech?.firstName ?? '',
                techAvatar: job.tech?.avatarUrl ?? null,
            },
            customer: job.customer,
            property: job.property,
            company: { name: job.company?.name ?? null, phone: settings.contact.phone ?? null },
            techLocation: visibleFix
                ? {
                      lat: visibleFix.lat,
                      lng: visibleFix.lng,
                      createdAt: visibleFix.createdAt,
                      ageSeconds: Math.max(0, Math.round((now.getTime() - new Date(visibleFix.createdAt).getTime()) / 1000)),
                  }
                : null,
            etaMinutes,
            eta:
                etaMinutes !== null
                    ? { minutes: etaMinutes, distanceKm, basis: 'live' as const }
                    : { minutes: null, distanceKm: null, basis: 'none' as const },
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
