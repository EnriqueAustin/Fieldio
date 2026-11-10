import type { CompanySettings } from '../company/company-settings';

export type RescheduleRules = CompanySettings['portal']['selfReschedule'];

/** Statuses a customer may still move. Once the tech is on the way it's the office's call. */
export const RESCHEDULABLE_STATUSES = ['REQUESTED', 'ASSIGNED'] as const;

/** Jobs that occupy a technician's calendar for conflict checks. */
export const BUSY_STATUSES = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'PAUSED'] as const;

const DEFAULT_DURATION_MIN = 120;
const SLOT_STEP_MIN = 60;
const MAX_SLOTS = 60;

export type IneligibleReason = 'DISABLED' | 'STATUS' | 'NOT_SCHEDULED' | 'TOO_LATE' | 'LIMIT_REACHED';

export interface Slot {
    start: Date;
    end: Date;
}

interface JobWindow {
    status: string;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
}

/** Minutes the zone is ahead of UTC at `date` (e.g. +120 for Africa/Johannesburg). */
function tzOffsetMinutes(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / 60000);
}

/** The UTC instant of local wall-clock time y-m-d h:00 in `timeZone`. */
function zonedInstant(y: number, m: number, d: number, h: number, timeZone: string): Date {
    const guess = new Date(Date.UTC(y, m, d, h));
    return new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60000);
}

function localYmd(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { y: get('year'), m: get('month') - 1, d: get('day') };
}

export function jobDurationMinutes(job: JobWindow): number {
    if (job.scheduledStart && job.scheduledEnd) {
        const mins = Math.round((job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 60000);
        if (mins >= 30) return mins;
    }
    return DEFAULT_DURATION_MIN;
}

export function checkEligibility(
    job: JobWindow,
    rules: RescheduleRules,
    priorReschedules: number,
    now: Date
): IneligibleReason | null {
    if (!rules.enabled) return 'DISABLED';
    if (!(RESCHEDULABLE_STATUSES as readonly string[]).includes(job.status)) return 'STATUS';
    if (!job.scheduledStart) return 'NOT_SCHEDULED';
    if (job.scheduledStart.getTime() - now.getTime() < rules.minNoticeHours * 3600_000) return 'TOO_LATE';
    if (priorReschedules >= rules.maxPerJob) return 'LIMIT_REACHED';
    return null;
}

/**
 * Open start times inside business hours over the booking horizon that keep
 * the job's current length, respect the notice period, and don't overlap
 * anything else on the technician's calendar.
 */
export function computeSlots(opts: {
    job: JobWindow;
    rules: RescheduleRules;
    timeZone: string;
    busy: Slot[];
    now: Date;
}): Slot[] {
    const { job, rules, timeZone, busy, now } = opts;
    const durationMs = jobDurationMinutes(job) * 60000;
    const earliest = now.getTime() + rules.minNoticeHours * 3600_000;
    const currentStart = job.scheduledStart?.getTime();
    const today = localYmd(now, timeZone);
    const slots: Slot[] = [];

    for (let i = 0; i <= rules.horizonDays && slots.length < MAX_SLOTS; i++) {
        // Date.UTC normalises day overflow, so this walks month boundaries correctly.
        const day = new Date(Date.UTC(today.y, today.m, today.d + i));
        if (!rules.workDays.includes(day.getUTCDay())) continue;

        const y = day.getUTCFullYear();
        const m = day.getUTCMonth();
        const d = day.getUTCDate();
        const dayEnd = zonedInstant(y, m, d, rules.dayEndHour, timeZone).getTime();

        for (
            let start = zonedInstant(y, m, d, rules.dayStartHour, timeZone).getTime();
            start + durationMs <= dayEnd && slots.length < MAX_SLOTS;
            start += SLOT_STEP_MIN * 60000
        ) {
            if (start < earliest) continue;
            if (start === currentStart) continue;
            const end = start + durationMs;
            const clashes = busy.some((b) => b.start.getTime() < end && b.end.getTime() > start);
            if (!clashes) slots.push({ start: new Date(start), end: new Date(end) });
        }
    }

    return slots;
}
