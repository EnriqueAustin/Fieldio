import { prisma } from '@fieldio/database';
import { normalizeCompanySettings } from '../modules/company/company-settings';

// The server may run in UTC (containers) — never rely on server-local time for
// anything a customer reads or for "today"/"this week" boundaries. Always pass
// the company's IANA zone (settings.regional.timezone).

export const DEFAULT_TIMEZONE = 'Africa/Johannesburg';
export const DEFAULT_LOCALE = 'en-ZA';

const validZones = new Map<string, boolean>();

/** Returns `tz` when it's a valid IANA zone, else the SA default. */
export const resolveTimeZone = (tz?: string | null): string => {
    if (!tz) return DEFAULT_TIMEZONE;
    let ok = validZones.get(tz);
    if (ok === undefined) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: tz });
            ok = true;
        } catch {
            ok = false;
        }
        validZones.set(tz, ok);
    }
    return ok ? tz : DEFAULT_TIMEZONE;
};

/** Timezone from a company's raw settings JSON. */
export const timezoneFromSettings = (settings: unknown): string =>
    resolveTimeZone(normalizeCompanySettings(settings as any)?.regional?.timezone);

/** Looks up the company's configured timezone (default Africa/Johannesburg). */
export const getCompanyTimezone = async (companyId: string): Promise<string> => {
    try {
        const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
        return timezoneFromSettings(company?.settings ?? {});
    } catch {
        return DEFAULT_TIMEZONE;
    }
};

/** en-ZA date/time in the given zone, e.g. "Sat, 7 Nov, 10:00". */
export const formatInTimeZone = (
    date: Date | string | number,
    tz?: string | null,
    opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    locale: string = DEFAULT_LOCALE,
): string => new Date(date).toLocaleString(locale, { ...opts, timeZone: resolveTimeZone(tz) });

/** Medium date + short time, e.g. "7 Nov 2026, 10:00". */
export const formatDateTimeInTimeZone = (date: Date | string | number, tz?: string | null, locale = DEFAULT_LOCALE) =>
    new Date(date).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: resolveTimeZone(tz) } as Intl.DateTimeFormatOptions);

/** Date only, e.g. "7 Nov 2026". */
export const formatDateInTimeZone = (date: Date | string | number, tz?: string | null, locale = DEFAULT_LOCALE) =>
    new Date(date).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: resolveTimeZone(tz) });

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in a zone (month 1-12, weekday 0=Sun). */
export const zonedParts = (date: Date, tz?: string | null): ZonedParts => {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: resolveTimeZone(tz),
        hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        weekday: 'short',
    });
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
    return {
        year: Number(p.year),
        month: Number(p.month),
        day: Number(p.day),
        hour: Number(p.hour) % 24,
        minute: Number(p.minute),
        second: Number(p.second),
        weekday: WEEKDAYS[p.weekday] ?? 0,
    };
};

/** Offset (ms) of the zone from UTC at the given instant. */
const offsetMs = (date: Date, tz: string): number => {
    const p = zonedParts(date, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** The UTC instant for a wall-clock time in a zone. Month is 1-12; day may overflow. */
export const zonedTimeToUtc = (year: number, month: number, day: number, hour = 0, minute = 0, tz?: string | null): Date => {
    const zone = resolveTimeZone(tz);
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const off1 = offsetMs(new Date(guess), zone);
    let result = guess - off1;
    // Second pass corrects for a DST change between the guess and the answer.
    const off2 = offsetMs(new Date(result), zone);
    if (off2 !== off1) result = guess - off2;
    return new Date(result);
};

/** Midnight (start of day) in the zone, `offsetDays` days from the instant's local date. */
export const startOfDayInTimeZone = (date: Date = new Date(), tz?: string | null, offsetDays = 0): Date => {
    const p = zonedParts(date, tz);
    return zonedTimeToUtc(p.year, p.month, p.day + offsetDays, 0, 0, tz);
};

/** Last millisecond of the instant's local day in the zone. */
export const endOfDayInTimeZone = (date: Date = new Date(), tz?: string | null): Date =>
    new Date(startOfDayInTimeZone(date, tz, 1).getTime() - 1);

/** Monday 00:00 of the instant's local week in the zone (weeks run Mon-Sun). */
export const startOfWeekInTimeZone = (date: Date = new Date(), tz?: string | null): Date => {
    const p = zonedParts(date, tz);
    const sinceMonday = (p.weekday + 6) % 7;
    return zonedTimeToUtc(p.year, p.month, p.day - sinceMonday, 0, 0, tz);
};

/** Last millisecond of the instant's local week (Sunday 23:59:59.999) in the zone. */
export const endOfWeekInTimeZone = (date: Date = new Date(), tz?: string | null): Date => {
    const start = startOfWeekInTimeZone(date, tz);
    const p = zonedParts(start, tz);
    return new Date(zonedTimeToUtc(p.year, p.month, p.day + 7, 0, 0, tz).getTime() - 1);
};
