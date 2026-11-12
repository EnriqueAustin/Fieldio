import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import {
    getCompanyTimezone,
    startOfDayInTimeZone,
    startOfWeekInTimeZone,
    endOfDayInTimeZone,
    endOfWeekInTimeZone,
} from '../../utils/timezone';


/**
 * Never spread a raw User row into a response: it carries passwordHash and pay
 * rates. Timesheets only ever need to name the person.
 */
const TIMESHEET_INCLUDE = {
    user: { select: { id: true, email: true, firstName: true, lastName: true } },
    job: { select: { id: true, title: true, status: true, customer: { select: { name: true } } } },
} as const;

type EntryWithRelations = {
    id: string;
    userId: string;
    jobId?: string | null;
    type: string;
    startTime: Date;
    endTime?: Date | null;
    duration?: number | null;
    description?: string | null;
    user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
    job?: { id: string; title: string } | null;
};

const personName = (u?: { firstName?: string | null; lastName?: string | null; email?: string } | null) => {
    if (!u) return 'Unknown';
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return name || u.email || 'Unknown';
};

// Seconds worked by an entry; an entry still running counts up to now.
const entrySeconds = (e: EntryWithRelations): number =>
    e.duration ?? Math.max(0, Math.floor((Date.now() - new Date(e.startTime).getTime()) / 1000));

// A compact before/after image for the audit trail — never the raw row.
const snapshot = (e: EntryWithRelations) => ({
    id: e.id,
    userId: e.userId,
    jobId: e.jobId ?? null,
    type: e.type,
    startTime: e.startTime,
    endTime: e.endTime ?? null,
    duration: e.duration ?? null,
    description: e.description ?? null,
});

// Every correction is recorded: who, when (createdAt), before, after, reason.
async function writeAudit(
    companyId: string,
    userId: string,
    action: string,
    entityId: string,
    metadata: { before: unknown; after: unknown; reason: string | null },
) {
    await prisma.auditLog.create({
        data: { companyId, userId, action, entityId, entityType: 'TIME_ENTRY', metadata: metadata as any },
    });
}

/**
 * Nobody can be in two places at once: a new or corrected entry must not overlap
 * any of that technician's other entries. An open entry (no endTime) is treated
 * as running up to now.
 */
async function assertNoOverlap(companyId: string, userId: string, start: Date, end: Date, excludeId?: string) {
    const existing = await prisma.timeEntry.findMany({ where: { companyId, userId } });
    const s = start.getTime();
    const e = end.getTime();
    for (const row of existing) {
        if (excludeId && row.id === excludeId) continue;
        const rs = new Date(row.startTime).getTime();
        const re = row.endTime ? new Date(row.endTime).getTime() : Date.now();
        if (s < re && e > rs) {
            throw new AppError('This overlaps an existing time entry for this technician', StatusCodes.CONFLICT);
        }
    }
}

// Resolve the reporting window. Default: this week, Monday–Sunday, in the
// company's timezone (not the container's UTC). A bare YYYY-MM-DD is read as a
// local day in that zone.
async function resolveRange(companyId: string, from?: string, to?: string) {
    const tz = await getCompanyTimezone(companyId);
    const now = new Date();
    const start = from ? startOfDayInTimeZone(new Date(from), tz) : startOfWeekInTimeZone(now, tz);
    const end = to ? endOfDayInTimeZone(new Date(to), tz) : endOfWeekInTimeZone(now, tz);
    return { tz, start, end };
}

/**
 * Nobody can be in two places at once, so a technician has at most one open
 * time entry. Job status changes are the only thing that opens one, and every
 * transition closes whatever was running first — including entries belonging to
 * a *different* job, which is the case that used to double-count: arriving at
 * job B while job A was still marked on-site left both clocks running.
 */
export async function closeOpenEntries(
    companyId: string,
    userId: string,
    at: Date = new Date(),
    // The one clock that should keep running — used when a transition finds the
    // correct entry already open and must not restart it.
    exceptId?: string
): Promise<number> {
    const open = (
        await prisma.timeEntry.findMany({
            where: { companyId, userId, endTime: null },
        })
    ).filter((entry) => entry.id !== exceptId);

    for (const entry of open) {
        const end = at > entry.startTime ? at : entry.startTime;
        await prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
                endTime: end,
                duration: Math.floor((end.getTime() - entry.startTime.getTime()) / 1000),
            },
        });
    }

    return open.length;
}

// A forgotten "on site" must not bill three days of labour. Anything still open
// past this is closed at the cap and flagged for the office to correct.
export const MAX_OPEN_ENTRY_SECONDS = 12 * 60 * 60;

/**
 * Close any entry that has been running past the cap, truncating it to the cap
 * and marking it for review. Runs on read, so a stale clock is corrected the
 * next time anyone looks at the timesheet.
 */
export async function truncateRunawayEntries(companyId: string, userId?: string) {
    const cutoff = new Date(Date.now() - MAX_OPEN_ENTRY_SECONDS * 1000);
    const stale = await prisma.timeEntry.findMany({
        where: { companyId, endTime: null, startTime: { lt: cutoff }, ...(userId ? { userId } : {}) },
    });

    for (const entry of stale) {
        await prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
                endTime: new Date(entry.startTime.getTime() + MAX_OPEN_ENTRY_SECONDS * 1000),
                duration: MAX_OPEN_ENTRY_SECONDS,
                description: `${entry.description ?? ''} [auto-closed at ${MAX_OPEN_ENTRY_SECONDS / 3600}h — needs review]`.trim(),
            },
        });
    }

    return stale.length;
}

export const timeTrackingService = {
    startEntry: async (companyId: string, userId: string, data: any) => {
        // One clock per person: whatever was running stops here rather than
        // rejecting the new entry, so a correction can never strand an open row.
        await closeOpenEntries(companyId, userId);

        return await prisma.timeEntry.create({
            data: {
                ...data,
                companyId,
                userId,
                startTime: data.startTime || new Date(),
            },
        });
    },

    // scopeToUserId limits the row to one person's timesheet. The office is
    // correcting *someone else's* hours, so it passes undefined.
    stopEntry: async (id: string, companyId: string, scopeToUserId: string | undefined, endTime?: Date) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) }
        });

        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);
        if (entry.endTime) throw new AppError('Time entry is already completed', StatusCodes.BAD_REQUEST);

        const end = endTime || new Date();
        const duration = Math.floor((end.getTime() - entry.startTime.getTime()) / 1000);

        return await prisma.timeEntry.update({
            where: { id },
            data: {
                endTime: end,
                duration,
            }
        });
    },

    /**
     * Office correction of an existing entry (start, end, job reassignment).
     * Validates the new window, blocks overlaps, and records a before/after
     * audit row with the mandatory reason.
     */
    updateEntry: async (
        id: string,
        companyId: string,
        scopeToUserId: string | undefined,
        actorUserId: string,
        data: { type?: string; jobId?: string; startTime?: string; endTime?: string; description?: string },
        reason: string,
    ) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) }
        });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        const before = snapshot(entry as EntryWithRelations);

        const newStart = data.startTime ? new Date(data.startTime) : entry.startTime;
        const newEnd =
            data.endTime !== undefined ? (data.endTime ? new Date(data.endTime) : null) : entry.endTime;

        if (newEnd && newEnd.getTime() <= new Date(newStart).getTime()) {
            throw new AppError('End time must be after start time', StatusCodes.BAD_REQUEST);
        }

        if (data.jobId) {
            const job = await prisma.job.findFirst({ where: { id: data.jobId, companyId } });
            if (!job) throw new AppError('Job not found in this company', StatusCodes.NOT_FOUND);
        }

        if (newEnd) {
            await assertNoOverlap(companyId, entry.userId, new Date(newStart), newEnd, id);
        }

        const updateData: any = {};
        if (data.type !== undefined) updateData.type = data.type;
        if (data.jobId !== undefined) updateData.jobId = data.jobId;
        if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
        if (data.endTime !== undefined) updateData.endTime = data.endTime ? new Date(data.endTime) : null;
        if (data.description !== undefined) updateData.description = data.description;
        updateData.duration = newEnd
            ? Math.floor((newEnd.getTime() - new Date(newStart).getTime()) / 1000)
            : null;

        const updated = await prisma.timeEntry.update({ where: { id }, data: updateData });

        await writeAudit(companyId, actorUserId, 'TIME_ENTRY_UPDATED', id, {
            before,
            after: snapshot(updated as EntryWithRelations),
            reason,
        });

        return updated;
    },

    /**
     * "Add missed entry" — the office recording labour the status clock never
     * captured. Office-only; validates the window, membership and overlap, and
     * leaves an audit row.
     */
    manualEntry: async (
        companyId: string,
        actorUserId: string,
        data: { userId: string; jobId?: string; startTime: string; endTime: string; note: string },
    ) => {
        const start = new Date(data.startTime);
        const end = new Date(data.endTime);
        if (!(end.getTime() > start.getTime())) {
            throw new AppError('End time must be after start time', StatusCodes.BAD_REQUEST);
        }

        const user = await prisma.user.findFirst({ where: { id: data.userId, companyId } });
        if (!user) throw new AppError('Technician not found in this company', StatusCodes.NOT_FOUND);

        if (data.jobId) {
            const job = await prisma.job.findFirst({ where: { id: data.jobId, companyId } });
            if (!job) throw new AppError('Job not found in this company', StatusCodes.NOT_FOUND);
        }

        await assertNoOverlap(companyId, data.userId, start, end);

        const entry = await prisma.timeEntry.create({
            data: {
                companyId,
                userId: data.userId,
                jobId: data.jobId ?? null,
                type: 'WRENCH',
                startTime: start,
                endTime: end,
                duration: Math.floor((end.getTime() - start.getTime()) / 1000),
                description: data.note,
            },
        });

        await writeAudit(companyId, actorUserId, 'TIME_ENTRY_MANUAL_ADD', entry.id, {
            before: null,
            after: snapshot(entry as EntryWithRelations),
            reason: data.note,
        });

        return entry;
    },

    getOne: async (id: string, companyId: string, scopeToUserId?: string) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) },
            include: TIMESHEET_INCLUDE
        });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);
        return entry;
    },

    /**
     * Timesheet for a date range (default: this week) with an optional tech and
     * job filter, per-technician totals for the whole range, and a paginated
     * slice of the entries. Totals cover every matching entry, not just the page.
     */
    getAll: async (
        companyId: string,
        opts: { userId?: string; jobId?: string; from?: string; to?: string; page?: number; limit?: number } = {},
    ) => {
        const { start, end } = await resolveRange(companyId, opts.from, opts.to);
        const page = Math.max(1, opts.page ?? 1);
        const limit = Math.min(500, Math.max(1, opts.limit ?? 50));

        const where: any = { companyId, startTime: { gte: start, lte: end } };
        if (opts.userId) where.userId = opts.userId;
        if (opts.jobId) where.jobId = opts.jobId;

        const all = (await prisma.timeEntry.findMany({
            where,
            orderBy: { startTime: 'desc' },
            include: TIMESHEET_INCLUDE,
        })) as unknown as EntryWithRelations[];

        // Per-technician totals across the whole range.
        const byTech = new Map<
            string,
            { userId: string; name: string; email: string | null; totalSeconds: number; entryCount: number }
        >();
        for (const e of all) {
            const row = byTech.get(e.userId) ?? {
                userId: e.userId,
                name: personName(e.user),
                email: e.user?.email ?? null,
                totalSeconds: 0,
                entryCount: 0,
            };
            row.totalSeconds += entrySeconds(e);
            row.entryCount += 1;
            byTech.set(e.userId, row);
        }

        const total = all.length;
        const entries = all.slice((page - 1) * limit, (page - 1) * limit + limit);

        return {
            entries,
            totals: [...byTech.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
                from: start,
                to: end,
            },
        };
    },

    /** All entries in the range, unpaged, for CSV export. */
    exportRange: async (
        companyId: string,
        opts: { userId?: string; jobId?: string; from?: string; to?: string } = {},
    ) => {
        const { tz, start, end } = await resolveRange(companyId, opts.from, opts.to);
        const where: any = { companyId, startTime: { gte: start, lte: end } };
        if (opts.userId) where.userId = opts.userId;
        if (opts.jobId) where.jobId = opts.jobId;

        const rows = (await prisma.timeEntry.findMany({
            where,
            orderBy: { startTime: 'desc' },
            include: TIMESHEET_INCLUDE,
        })) as unknown as EntryWithRelations[];

        return { rows, tz, start, end };
    },

    /**
     * Hours as the system worked them out, for the person who worked them.
     *
     * Technicians don't log time — job status does — so this is the read-only
     * view that replaces the old manual timesheet: today and this week, split
     * travel vs on-site, and a per-job breakdown of the current day.
     */
    getMySummary: async (companyId: string, userId: string) => {
        await truncateRunawayEntries(companyId, userId);

        const now = new Date();
        // "Today" is the company's day, not the (often UTC) server's.
        const tz = await getCompanyTimezone(companyId);
        const startOfToday = startOfDayInTimeZone(now, tz);
        // Weeks run Monday-Sunday, matching how SA trades invoice labour.
        const startOfWeek = startOfWeekInTimeZone(now, tz);

        const entries = await prisma.timeEntry.findMany({
            where: { companyId, userId, startTime: { gte: startOfWeek } },
            orderBy: { startTime: 'desc' },
            include: TIMESHEET_INCLUDE,
        });

        // An entry still running counts up to now, so today's total is live.
        const seconds = (entry: (typeof entries)[number]) =>
            entry.duration ?? Math.max(0, Math.floor((now.getTime() - entry.startTime.getTime()) / 1000));

        const todayEntries = entries.filter((e) => e.startTime >= startOfToday);
        const sum = (rows: typeof entries, type?: string) =>
            rows.filter((e) => !type || e.type === type).reduce((acc, e) => acc + seconds(e), 0);

        // Per-job breakdown of today, so a technician can see where the day went.
        const byJob = new Map<string, { jobId: string | null; title: string; travel: number; onSite: number }>();
        for (const entry of todayEntries) {
            if (entry.type !== 'TRAVEL' && entry.type !== 'WRENCH') continue;
            const key = entry.jobId ?? 'none';
            const row = byJob.get(key) ?? {
                jobId: entry.jobId,
                title: entry.job?.title ?? 'Unassigned time',
                travel: 0,
                onSite: 0,
            };
            if (entry.type === 'TRAVEL') row.travel += seconds(entry);
            else row.onSite += seconds(entry);
            byJob.set(key, row);
        }

        const active = entries.find((e) => !e.endTime) ?? null;

        // Travel and on-site are the only kinds the system generates. Admin and
        // break time can still exist from an office adjustment, so it is reported
        // as "other" rather than left out — otherwise the split would not add up
        // to the total and the screen would look broken.
        const other = (rows: typeof entries) =>
            rows.filter((e) => e.type !== 'TRAVEL' && e.type !== 'WRENCH').reduce((acc, e) => acc + seconds(e), 0);

        return {
            today: {
                total: sum(todayEntries),
                travel: sum(todayEntries, 'TRAVEL'),
                onSite: sum(todayEntries, 'WRENCH'),
                other: other(todayEntries),
                jobs: [...byJob.values()].sort((a, b) => b.travel + b.onSite - (a.travel + a.onSite)),
            },
            week: {
                total: sum(entries),
                travel: sum(entries, 'TRAVEL'),
                onSite: sum(entries, 'WRENCH'),
                other: other(entries),
                start: startOfWeek,
            },
            // What the clock is doing right now, and which job drives it.
            active: active
                ? {
                      id: active.id,
                      type: active.type,
                      startTime: active.startTime,
                      job: active.job ? { id: active.job.id, title: active.job.title } : null,
                  }
                : null,
            entries: todayEntries,
        };
    },

    /**
     * TimeEntry has no soft-delete column, so this is a hard delete — but the
     * full before-image is written to the audit log first, so a misclick on a
     * payroll record is always recoverable from the trail.
     */
    deleteEntry: async (
        id: string,
        companyId: string,
        scopeToUserId: string | undefined,
        actorUserId: string,
        reason?: string,
    ) => {
        const entry = await prisma.timeEntry.findFirst({ where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) } });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        await writeAudit(companyId, actorUserId, 'TIME_ENTRY_DELETED', id, {
            before: snapshot(entry as EntryWithRelations),
            after: null,
            reason: reason ?? null,
        });

        return await prisma.timeEntry.delete({
            where: { id }
        });
    }
};

/** Build a CSV of filtered timesheet entries for the office to download. */
export function buildTimesheetCsv(
    rows: EntryWithRelations[],
    formatDateTime: (d: Date | string) => string,
): string {
    const header = ['Technician', 'Email', 'Type', 'Start', 'End', 'Duration (h)', 'Job', 'Note'];
    const esc = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((e) =>
        [
            personName(e.user),
            e.user?.email ?? '',
            e.type,
            formatDateTime(e.startTime),
            e.endTime ? formatDateTime(e.endTime) : '',
            (entrySeconds(e) / 3600).toFixed(2),
            e.job?.title ?? '',
            e.description ?? '',
        ]
            .map(esc)
            .join(','),
    );
    return [header.join(','), ...lines].join('\n');
}
