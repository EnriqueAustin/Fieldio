// Pure scheduling helpers shared by the schedule page, the dispatch board and
// scripts/test-schedule.ts. No React, no browser APIs, and only type imports so
// the node strip-types test runner can load this file directly.
import type { BusinessHours, DayHours } from "./company-settings";

const pad = (n: number) => String(n).padStart(2, "0");

const toDate = (value?: string | Date | null): Date | null => {
    if (value === undefined || value === null || value === "") return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Local "yyyy-MM-dd'T'HH:mm" for <input type="datetime-local">; "" when empty or invalid. */
export const toLocalInput = (value?: string | Date | null): string => {
    const date = toDate(value);
    if (!date) return "";
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
};

export const displayName = (u: { firstName?: string | null; lastName?: string | null; email: string }): string =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0];

// Index matches Date#getDay() (0 = Sunday).
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "HH:MM" → minutes since midnight, or null when malformed. "24:00" is allowed. */
const parseHm = (value: string | undefined): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    if (Number(match[2]) > 59 || minutes > 24 * 60) return null;
    return minutes;
};

const formatHms = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;

/** Minutes window for an open day, or null when closed / malformed / empty. */
const openWindow = (day: DayHours | undefined): { start: number; end: number } | null => {
    if (!day?.open) return null;
    const start = parseHm(day.start);
    const end = parseHm(day.end);
    if (start === null || end === null || end <= start) return null;
    return { start, end };
};

/** Business hours for that calendar day, or null when the business is closed (or hours unknown). */
export const hoursForDate = (
    bh: BusinessHours | undefined,
    date: Date
): { start: string; end: string } | null => {
    if (!bh) return null;
    const day = bh[DAY_KEYS[date.getDay()]];
    if (!openWindow(day)) return null;
    return { start: day.start, end: day.end };
};

const FALLBACK_RANGE = { slotMinTime: "07:00:00", slotMaxTime: "18:00:00" };

/** FullCalendar slotMin/MaxTime: earliest open − 1h to latest close + 1h, clamped to the day. */
export const calendarHoursRange = (bh: BusinessHours | undefined): { slotMinTime: string; slotMaxTime: string } => {
    if (!bh) return FALLBACK_RANGE;
    const windows = DAY_KEYS.map((key) => openWindow(bh[key])).filter(
        (w): w is { start: number; end: number } => w !== null
    );
    if (windows.length === 0) return FALLBACK_RANGE;
    const earliest = Math.min(...windows.map((w) => w.start));
    const latest = Math.max(...windows.map((w) => w.end));
    return {
        slotMinTime: formatHms(Math.max(0, earliest - 60)),
        slotMaxTime: formatHms(Math.min(24 * 60, latest + 60)),
    };
};

/** FullCalendar businessHours; days with identical hours are grouped into one entry. */
export const fcBusinessHours = (
    bh: BusinessHours | undefined
): { daysOfWeek: number[]; startTime: string; endTime: string }[] => {
    if (!bh) return [];
    const groups = new Map<string, { daysOfWeek: number[]; startTime: string; endTime: string }>();
    DAY_KEYS.forEach((key, index) => {
        const window = openWindow(bh[key]);
        if (!window) return;
        const startTime = formatHms(window.start);
        const endTime = formatHms(window.end);
        const groupKey = `${startTime}-${endTime}`;
        const group = groups.get(groupKey);
        if (group) group.daysOfWeek.push(index);
        else groups.set(groupKey, { daysOfWeek: [index], startTime, endTime });
    });
    return Array.from(groups.values());
};

/** Start for a drop onto a whole day (month view): that day at opening time, or 08:00. */
export const defaultDropStart = (date: Date, bh: BusinessHours | undefined): Date => {
    const hours = hoursForDate(bh, date);
    const minutes = (hours && parseHm(hours.start)) ?? 8 * 60;
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return result;
};

export type Availability = "FREE" | "EN_ROUTE" | "ON_SITE" | "BUSY" | "OFFLINE";

export const computeAvailability = (args: {
    techId: string;
    ping?: { isStale: boolean; activeJob?: { status: string; customerName?: string } | null } | null;
    todayEvents: { extendedProps: { techId?: string | null; vanId?: string | null } }[];
    vanIds?: Set<string>;
}): { availability: Availability; current?: string; todayCount: number } => {
    const { techId, ping, todayEvents, vanIds } = args;
    // A van-assigned job counts toward every crew member's load.
    const todayCount = todayEvents.filter((e) => {
        if (e.extendedProps.techId === techId) return true;
        return Boolean(e.extendedProps.vanId && vanIds?.has(e.extendedProps.vanId));
    }).length;
    const todayLabel = `${todayCount} job${todayCount !== 1 ? "s" : ""} today`;

    if (ping && !ping.isStale) {
        const status = ping.activeJob?.status;
        if (status === "EN_ROUTE" || status === "ON_SITE") {
            return { availability: status, current: ping.activeJob?.customerName, todayCount };
        }
        if (todayCount > 0) return { availability: "BUSY", current: todayLabel, todayCount };
        return { availability: "FREE", todayCount };
    }
    // Scheduled work but no fresh GPS ping reads as "Scheduled", not "Offline".
    if (todayCount > 0) return { availability: "BUSY", current: todayLabel, todayCount };
    return { availability: "OFFLINE", todayCount };
};

/**
 * Horizontal layout for one lane of the dispatch board. Items are clipped to
 * [dayStart, dayEnd] (items entirely outside are dropped), sorted by start,
 * and overlapping items are stacked greedily into rows. `rows` is the row
 * count of the item's overlap cluster so a cluster can share the lane height.
 */
export const layoutLane = <T extends { id: string; start: Date; end: Date }>(
    items: T[],
    dayStart: Date,
    dayEnd: Date
): (T & { leftPct: number; widthPct: number; row: number; rows: number })[] => {
    const windowStart = dayStart.getTime();
    const windowEnd = dayEnd.getTime();
    const span = windowEnd - windowStart;
    if (!(span > 0)) return [];

    const visible = items
        .map((item) => {
            const s = item.start.getTime();
            // Treat zero/negative durations as a 1 ms point so they still render and stack.
            const e = Math.max(item.end.getTime(), s + 1);
            return { item, s, e };
        })
        .filter(({ s, e }) => !Number.isNaN(s) && !Number.isNaN(e) && e > windowStart && s < windowEnd)
        .sort((a, b) => a.s - b.s || b.e - a.e || a.item.id.localeCompare(b.item.id));

    const result: (T & { leftPct: number; widthPct: number; row: number; rows: number })[] = [];
    let cluster: typeof result = [];
    let rowEnds: number[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        const rows = Math.max(1, rowEnds.length);
        cluster.forEach((entry) => {
            entry.rows = rows;
            result.push(entry);
        });
        cluster = [];
        rowEnds = [];
    };

    visible.forEach(({ item, s, e }) => {
        if (s >= clusterEnd) flush();
        let row = rowEnds.findIndex((end) => end <= s);
        if (row === -1) {
            row = rowEnds.length;
            rowEnds.push(e);
        } else {
            rowEnds[row] = e;
        }
        clusterEnd = Math.max(clusterEnd, e);
        const clippedStart = Math.max(s, windowStart);
        const clippedEnd = Math.min(e, windowEnd);
        cluster.push({
            ...item,
            leftPct: ((clippedStart - windowStart) / span) * 100,
            widthPct: ((clippedEnd - clippedStart) / span) * 100,
            row,
            rows: 1,
        });
    });
    flush();
    return result;
};

const CLOSED_DAY_WINDOW = { start: 7 * 60, end: 18 * 60 };

/**
 * Visible time window (minutes since midnight) for the dispatch board's day:
 * business hours padded by an hour (07:00–18:00 when closed), widened to the
 * whole hours covering that day's events so nothing is clipped out of view.
 * `open`/`close` are the business hours, or null when the day is closed.
 */
export const boardTimeWindow = (
    hours: { start: string; end: string } | null,
    events: { start: Date; end: Date }[],
    date: Date
): { startMin: number; endMin: number; open: number | null; close: number | null } => {
    const open = hours ? parseHm(hours.start) : null;
    const close = hours ? parseHm(hours.end) : null;
    const isOpen = open !== null && close !== null && close > open;
    let startMin = isOpen ? Math.max(0, open - 60) : CLOSED_DAY_WINDOW.start;
    let endMin = isOpen ? Math.min(24 * 60, close + 60) : CLOSED_DAY_WINDOW.end;

    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    events.forEach((event) => {
        const s = (event.start.getTime() - midnight) / 60000;
        const e = (event.end.getTime() - midnight) / 60000;
        if (Number.isNaN(s) || Number.isNaN(e) || e <= 0 || s >= 24 * 60) return;
        startMin = Math.min(startMin, Math.max(0, Math.floor(s / 60) * 60));
        endMin = Math.max(endMin, Math.min(24 * 60, Math.ceil(e / 60) * 60));
    });

    return { startMin, endMin, open: isOpen ? open : null, close: isOpen ? close : null };
};
