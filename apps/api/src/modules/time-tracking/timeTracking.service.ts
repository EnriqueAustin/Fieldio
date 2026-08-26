import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';


/**
 * Never spread a raw User row into a response: it carries passwordHash and pay
 * rates. Timesheets only ever need to name the person.
 */
const TIMESHEET_INCLUDE = {
    user: { select: { id: true, email: true, firstName: true, lastName: true } },
    job: { select: { id: true, title: true, status: true, customer: { select: { name: true } } } },
} as const;

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

    updateEntry: async (id: string, companyId: string, scopeToUserId: string | undefined, data: any) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) }
        });

        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        let duration = entry.duration;
        let endTime = data.endTime || entry.endTime;
        let startTime = data.startTime || entry.startTime;

        if (endTime && startTime) {
            duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
        }

        return await prisma.timeEntry.update({
            where: { id },
            data: {
                ...data,
                duration,
            }
        });
    },

    getOne: async (id: string, companyId: string, scopeToUserId?: string) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) },
            include: TIMESHEET_INCLUDE
        });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);
        return entry;
    },

    getAll: async (companyId: string, userId?: string, jobId?: string, page: number = 1, limit: number = 20) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId };
        if (userId) where.userId = userId;
        if (jobId) where.jobId = jobId;

        const [entries, total] = await Promise.all([
            prisma.timeEntry.findMany({
                where,
                skip,
                take: limit,
                orderBy: { startTime: 'desc' },
                include: TIMESHEET_INCLUDE
            }),
            prisma.timeEntry.count({ where })
        ]);

        return {
            entries,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
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
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // Weeks run Monday-Sunday, matching how SA trades invoice labour.
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));

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

    deleteEntry: async (id: string, companyId: string, scopeToUserId?: string) => {
        const entry = await prisma.timeEntry.findFirst({ where: { id, companyId, ...(scopeToUserId ? { userId: scopeToUserId } : {}) } });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        return await prisma.timeEntry.delete({
            where: { id }
        });
    }
};
