// Run from apps/web: node --experimental-strip-types scripts/test-schedule.ts
// Pin the timezone BEFORE any Date is created so local-time assertions are
// deterministic (SAST is UTC+2 with no DST).
process.env.TZ = 'Africa/Johannesburg';

import assert from 'node:assert/strict';
import type { BusinessHours } from '../src/lib/company-settings.ts';
import {
    boardTimeWindow,
    calendarHoursRange,
    computeAvailability,
    defaultDropStart,
    displayName,
    fcBusinessHours,
    hoursForDate,
    layoutLane,
    toLocalInput,
} from '../src/lib/schedule-utils.ts';

const run = (name: string, fn: () => void) => {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
};

// Same values as defaultBusinessHours in company-settings.ts (kept inline so this
// runner only needs a type import from that module).
const defaults: BusinessHours = {
    mon: { open: true, start: '08:00', end: '17:00' },
    tue: { open: true, start: '08:00', end: '17:00' },
    wed: { open: true, start: '08:00', end: '17:00' },
    thu: { open: true, start: '08:00', end: '17:00' },
    fri: { open: true, start: '08:00', end: '17:00' },
    sat: { open: true, start: '08:00', end: '13:00' },
    sun: { open: false, start: '08:00', end: '17:00' },
};

run('toLocalInput converts a UTC ISO string to SAST local time', () => {
    assert.equal(toLocalInput('2026-11-24T06:30:00.000Z'), '2026-11-24T08:30');
});

run('toLocalInput converts an offset string to SAST local time', () => {
    assert.equal(toLocalInput('2026-11-24T23:15:00-05:00'), '2026-11-25T06:15');
});

run('toLocalInput returns empty for empty or invalid input', () => {
    assert.equal(toLocalInput(null), '');
    assert.equal(toLocalInput(undefined), '');
    assert.equal(toLocalInput(''), '');
    assert.equal(toLocalInput('not a date'), '');
});

run('displayName prefers names and falls back to the email prefix', () => {
    assert.equal(displayName({ firstName: 'Sipho', lastName: 'Mthembu', email: 'x@y.co' }), 'Sipho Mthembu');
    assert.equal(displayName({ firstName: null, lastName: null, email: 'thabo@mthembu.co.za' }), 'thabo');
});

run('hoursForDate returns null on a closed Sunday and hours on a Saturday', () => {
    assert.equal(hoursForDate(defaults, new Date(2026, 10, 29)), null); // Sun 29 Nov 2026
    assert.deepEqual(hoursForDate(defaults, new Date(2026, 10, 28)), { start: '08:00', end: '13:00' });
    assert.equal(hoursForDate(undefined, new Date(2026, 10, 24)), null);
});

run('calendarHoursRange pads the default hours by an hour each side', () => {
    assert.deepEqual(calendarHoursRange(defaults), { slotMinTime: '07:00:00', slotMaxTime: '18:00:00' });
});

run('calendarHoursRange clamps to the day and falls back when nothing is open', () => {
    const late: BusinessHours = { ...defaults, fri: { open: true, start: '00:30', end: '23:30' } };
    assert.deepEqual(calendarHoursRange(late), { slotMinTime: '00:00:00', slotMaxTime: '24:00:00' });
    const closed = Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => [k, { ...v, open: false }])
    ) as BusinessHours;
    assert.deepEqual(calendarHoursRange(closed), { slotMinTime: '07:00:00', slotMaxTime: '18:00:00' });
    assert.deepEqual(calendarHoursRange(undefined), { slotMinTime: '07:00:00', slotMaxTime: '18:00:00' });
});

run('fcBusinessHours groups identical days and skips closed ones', () => {
    assert.deepEqual(fcBusinessHours(defaults), [
        { daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00:00', endTime: '17:00:00' },
        { daysOfWeek: [6], startTime: '08:00:00', endTime: '13:00:00' },
    ]);
});

run('defaultDropStart uses the opening time, or 08:00 when closed', () => {
    const custom: BusinessHours = { ...defaults, tue: { open: true, start: '07:30', end: '16:00' } };
    const tue = defaultDropStart(new Date(2026, 10, 24), custom);
    assert.equal(toLocalInput(tue), '2026-11-24T07:30');
    const sun = defaultDropStart(new Date(2026, 10, 29), defaults);
    assert.equal(toLocalInput(sun), '2026-11-29T08:00');
    assert.equal(toLocalInput(defaultDropStart(new Date(2026, 10, 24, 15, 45), undefined)), '2026-11-24T08:00');
});

const ev = (techId: string | null, vanId: string | null = null) => ({ extendedProps: { techId, vanId } });

run('computeAvailability: fresh ping en route / on site shows the customer', () => {
    const enRoute = computeAvailability({
        techId: 't1',
        ping: { isStale: false, activeJob: { status: 'EN_ROUTE', customerName: 'Naidoo' } },
        todayEvents: [ev('t1')],
    });
    assert.deepEqual(enRoute, { availability: 'EN_ROUTE', current: 'Naidoo', todayCount: 1 });
    const onSite = computeAvailability({
        techId: 't1',
        ping: { isStale: false, activeJob: { status: 'ON_SITE', customerName: 'Dlamini' } },
        todayEvents: [],
    });
    assert.deepEqual(onSite, { availability: 'ON_SITE', current: 'Dlamini', todayCount: 0 });
});

run('computeAvailability: fresh ping with jobs is BUSY, without jobs FREE', () => {
    const busy = computeAvailability({
        techId: 't1',
        ping: { isStale: false, activeJob: null },
        todayEvents: [ev('t1'), ev('t1'), ev('t2')],
    });
    assert.deepEqual(busy, { availability: 'BUSY', current: '2 jobs today', todayCount: 2 });
    const free = computeAvailability({ techId: 't1', ping: { isStale: false }, todayEvents: [ev('t2')] });
    assert.deepEqual(free, { availability: 'FREE', todayCount: 0 });
});

run('computeAvailability: stale ping with a van job is BUSY, nothing is OFFLINE', () => {
    const viaVan = computeAvailability({
        techId: 't1',
        ping: { isStale: true, activeJob: { status: 'ON_SITE', customerName: 'Old' } },
        todayEvents: [ev(null, 'van-1'), ev(null, 'van-2')],
        vanIds: new Set(['van-1']),
    });
    assert.deepEqual(viaVan, { availability: 'BUSY', current: '1 job today', todayCount: 1 });
    const offline = computeAvailability({ techId: 't1', ping: null, todayEvents: [ev(null, 'van-1')] });
    assert.deepEqual(offline, { availability: 'OFFLINE', todayCount: 0 });
});

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m);

run('layoutLane stacks overlapping items into rows', () => {
    const out = layoutLane(
        [
            { id: 'a', start: at(9), end: at(11) },
            { id: 'b', start: at(10), end: at(12) },
            { id: 'c', start: at(11), end: at(12) }, // fits back in row 0 after a
            { id: 'd', start: at(14), end: at(15) }, // separate cluster
        ],
        at(7),
        at(18)
    );
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    assert.deepEqual([byId.a.row, byId.b.row, byId.c.row, byId.d.row], [0, 1, 0, 0]);
    assert.deepEqual([byId.a.rows, byId.b.rows, byId.c.rows, byId.d.rows], [2, 2, 2, 1]);
    assert.ok(Math.abs(byId.a.leftPct - (2 / 11) * 100) < 1e-9);
    assert.ok(Math.abs(byId.a.widthPct - (2 / 11) * 100) < 1e-9);
});

run('layoutLane clips to the window and drops items outside it', () => {
    const out = layoutLane(
        [
            { id: 'early', start: at(5), end: at(8) },
            { id: 'late', start: at(17), end: at(20) },
            { id: 'outside', start: at(19), end: at(20) },
        ],
        at(7),
        at(18)
    );
    assert.deepEqual(out.map((o) => o.id), ['early', 'late']);
    const [early, late] = out;
    assert.equal(early.leftPct, 0);
    assert.ok(Math.abs(early.widthPct - (1 / 11) * 100) < 1e-9);
    assert.ok(Math.abs(late.leftPct + late.widthPct - 100) < 1e-9);
});

run('boardTimeWindow pads business hours and widens to fit the day of jobs', () => {
    const day = new Date(2026, 10, 24);
    assert.deepEqual(boardTimeWindow({ start: '08:00', end: '17:00' }, [], day), {
        startMin: 7 * 60,
        endMin: 18 * 60,
        open: 8 * 60,
        close: 17 * 60,
    });
    const wide = boardTimeWindow(
        { start: '08:00', end: '17:00' },
        [
            { start: at(5, 30), end: at(6, 15) },
            { start: at(19, 10), end: at(20, 5) },
        ],
        day
    );
    assert.deepEqual([wide.startMin, wide.endMin], [5 * 60, 21 * 60]);
});

run('boardTimeWindow uses 07:00-18:00 when closed and clamps overnight jobs to the day', () => {
    const day = new Date(2026, 10, 29);
    const closed = boardTimeWindow(null, [], day);
    assert.deepEqual(closed, { startMin: 7 * 60, endMin: 18 * 60, open: null, close: null });
    const overnight = boardTimeWindow(
        null,
        [
            { start: new Date(2026, 10, 28, 22), end: new Date(2026, 10, 29, 2) },
            { start: new Date(2026, 10, 29, 23), end: new Date(2026, 10, 30, 1) },
            { start: new Date(2026, 10, 30, 9), end: new Date(2026, 10, 30, 10) }, // other day: ignored
        ],
        day
    );
    assert.deepEqual([overnight.startMin, overnight.endMin], [0, 24 * 60]);
});

console.log('All schedule tests passed');
