import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import {
    buildGoogleMapsRouteUrl,
    estimateDriveMinutes,
    estimateLiveEta,
    haversineKm,
    planRoute,
    ROUTE_ESTIMATE,
    type RouteStopInput,
} from '../src/modules/scheduling/route-planner';

// ---------------------------------------------------------------------------
// Pure planner
// ---------------------------------------------------------------------------

// Points along a line east of central Durban; 0.01° lng ≈ 0.97 km here.
const BASE = { lat: -29.85, lng: 31.0 };
const east = (km: number) => ({ lat: BASE.lat, lng: BASE.lng + km / 96.5 });
const at = (hhmm: string) => new Date(`2026-11-03T${hhmm}:00+02:00`);

function stop(id: string, km: number | null, start: string, end: string, extra: Partial<RouteStopInput> = {}): RouteStopInput {
    const p = km === null ? { lat: null, lng: null } : east(km);
    return { id, ...p, scheduledStart: at(start), scheduledEnd: at(end), ...extra };
}
// A full-day window marks a job as flexible ("any time today").
const flex = (id: string, km: number | null) => stop(id, km, '07:00', '17:00');
const ids = (plan: ReturnType<typeof planRoute>) => plan.stops.map((s) => s.stop.id);

describe('route planner', () => {
    it('keeps fixed appointments in chronological order even when geography disagrees', () => {
        const plan = planRoute(
            [stop('late-near', 1, '14:00', '15:00'), stop('early-far', 20, '08:00', '09:00'), stop('mid', 2, '11:00', '12:00')],
            BASE,
        );
        expect(ids(plan)).toEqual(['early-far', 'mid', 'late-near']);
        expect(plan.stops.every((s) => s.kind === 'fixed')).toBe(true);
    });

    it('orders flexible stops by nearest neighbour from the origin', () => {
        const plan = planRoute([flex('c', 9), flex('a', 1), flex('d', 14), flex('b', 4)], BASE);
        expect(ids(plan)).toEqual(['a', 'b', 'c', 'd']);
        expect(plan.stops[0].leg?.distanceKm).toBeCloseTo(1, 0);
        expect(plan.totalDistanceKm).toBeCloseTo(14, 0);
    });

    it('starts from the earliest job when there is no location ping', () => {
        const plan = planRoute([flex('x', 10), stop('first', 0, '07:00', '17:00'), flex('y', 5)], null);
        // All share the same window so time ties break by id; the first stop has no leg.
        expect(plan.stops[0].leg).toBeNull();
        expect(ids(plan)).toHaveLength(3);
        // Whatever the first stop, the rest follow nearest-neighbour along the line.
        const kms = plan.stops.map((s) => haversineKm(BASE, { lat: s.stop.lat!, lng: s.stop.lng! }));
        const sortedAsc = [...kms].sort((a, b) => a - b);
        const sortedDesc = [...kms].sort((a, b) => b - a);
        expect([sortedAsc, sortedDesc]).toContainEqual(kms);
    });

    it('slots a flexible job into the gap between fixed appointments where it fits best', () => {
        const plan = planRoute(
            [stop('A', 0, '09:00', '10:00'), stop('B', 10, '14:00', '15:00'), flex('onTheWay', 5), flex('pastB', 12)],
            BASE,
        );
        expect(ids(plan)).toEqual(['A', 'onTheWay', 'B', 'pastB']);
        expect(plan.stops.find((s) => s.stop.id === 'onTheWay')?.kind).toBe('flexible');
    });

    it('puts in-progress jobs first, before earlier fixed appointments', () => {
        const plan = planRoute(
            [stop('fixed', 1, '08:00', '09:00'), stop('working', 5, '10:00', '11:00', { inProgress: true }), flex('f', 0.5)],
            BASE,
        );
        expect(ids(plan)[0]).toBe('working');
        expect(plan.stops[0].kind).toBe('inProgress');
    });

    it('moves jobs without coordinates to the end in time order, flagged noLocation', () => {
        const plan = planRoute(
            [stop('nogeo-late', null, '15:00', '16:00'), stop('geo', 2, '13:00', '14:00'), stop('nogeo-early', null, '08:00', '09:00')],
            BASE,
        );
        expect(ids(plan)).toEqual(['geo', 'nogeo-early', 'nogeo-late']);
        expect(plan.stops.map((s) => s.noLocation)).toEqual([false, true, true]);
        expect(plan.stops[1].leg).toBeNull();
        expect(plan.stops.map((s) => s.order)).toEqual([1, 2, 3]);
    });

    it('estimates drive time from the shared speed constant plus buffer', () => {
        expect(ROUTE_ESTIMATE.AVG_SPEED_KMH).toBe(35);
        expect(estimateDriveMinutes(35)).toBe(60 + ROUTE_ESTIMATE.LEG_BUFFER_MIN);
        expect(estimateDriveMinutes(0)).toBe(0);
    });

    it('builds a Google Maps multi-stop URL and truncates past the waypoint cap', () => {
        const pts = [east(1), east(2), east(3)];
        const res = buildGoogleMapsRouteUrl(BASE, pts)!;
        const url = new URL(res.url);
        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('api')).toBe('1');
        expect(url.searchParams.get('origin')).toBe('-29.850000,31.000000');
        expect(url.searchParams.get('destination')).toBe(`${pts[2].lat.toFixed(6)},${pts[2].lng.toFixed(6)}`);
        expect(url.searchParams.get('waypoints')!.split('|')).toHaveLength(2);
        expect(res.truncated).toBe(false);

        const many = Array.from({ length: 14 }, (_, i) => east(i + 1));
        const long = buildGoogleMapsRouteUrl(null, many)!;
        const longUrl = new URL(long.url);
        expect(longUrl.searchParams.get('origin')).toBeNull();
        expect(longUrl.searchParams.get('waypoints')!.split('|')).toHaveLength(ROUTE_ESTIMATE.MAX_WAYPOINTS);
        expect(long.truncated).toBe(true);
        expect(buildGoogleMapsRouteUrl(BASE, [])).toBeNull();
    });

    it('only gives a live ETA for a fresh ping on an en-route job with a located site', () => {
        const now = new Date('2026-11-03T10:00:00Z');
        const site = east(7);
        const fresh = { ...BASE, createdAt: new Date(now.getTime() - 5 * 60_000) };
        const stale = { ...BASE, createdAt: new Date(now.getTime() - 20 * 60_000) };
        const live = estimateLiveEta({ status: 'EN_ROUTE', ping: fresh, site, now });
        expect(live.basis).toBe('live');
        expect(live.distanceKm).toBeCloseTo(7, 0);
        expect(live.minutes).toBe(estimateDriveMinutes(haversineKm(BASE, site)));
        expect(estimateLiveEta({ status: 'EN_ROUTE', ping: stale, site, now }).basis).toBe('none');
        expect(estimateLiveEta({ status: 'ASSIGNED', ping: fresh, site, now }).basis).toBe('none');
        expect(estimateLiveEta({ status: 'EN_ROUTE', ping: fresh, site: { lat: null, lng: null }, now })).toEqual({
            minutes: null,
            distanceKm: null,
            basis: 'none',
        });
    });
});

// ---------------------------------------------------------------------------
// HTTP: GET /schedule/my-route and the public tracker ETA
// ---------------------------------------------------------------------------

const app = buildTestApp();
const COMPANY = 'company_1';
const OTHER = 'company_2';
const DATE = '2026-11-03';

const property = (km: number | null) => ({
    addressLine1: `${km ?? 'Unknown'} Smith St`,
    city: 'Durban',
    geoLat: km === null ? null : east(km).lat,
    geoLng: km === null ? null : east(km).lng,
});

function job(id: string, over: Record<string, any>) {
    return {
        id,
        companyId: COMPANY,
        title: `Job ${id}`,
        status: 'ASSIGNED',
        priority: 'MEDIUM',
        scheduledStart: at('09:00'),
        scheduledEnd: at('10:00'),
        techId: 'tech_a',
        vanId: null,
        customer: { name: 'Mrs Naidoo' },
        property: property(1),
        // Pricing on the row must never leak into the route payload.
        total: 98765,
        invoice: { total: 98765 },
        ...over,
    };
}

function seed() {
    fakePrisma.user.seed([
        { id: 'tech_a', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE' },
        { id: 'tech_b', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE' },
        { id: 'tech_x', companyId: OTHER, role: 'TECHNICIAN', status: 'ACTIVE' },
    ]);
    fakePrisma.vanMember.seed([{ id: 'vm_1', userId: 'tech_a', vanId: 'van_1' }]);
    fakePrisma.job.seed([
        job('j_late', { scheduledStart: at('14:00'), scheduledEnd: at('15:00'), property: property(2) }),
        job('j_early', { scheduledStart: at('08:00'), scheduledEnd: at('09:00'), property: property(8) }),
        job('j_nogeo', { scheduledStart: at('11:00'), scheduledEnd: at('12:00'), property: property(null) }),
        job('j_van', { techId: null, vanId: 'van_1', scheduledStart: at('12:00'), scheduledEnd: at('13:00'), property: property(5) }),
        job('j_done', { status: 'COMPLETED' }),
        job('j_tomorrow', { scheduledStart: new Date('2026-11-04T09:00:00+02:00'), scheduledEnd: new Date('2026-11-04T10:00:00+02:00') }),
        job('j_other_tech', { techId: 'tech_b' }),
        job('j_other_company', { companyId: OTHER }),
    ]);
    fakePrisma.userLocationPing.seed([
        { id: 'p_1', userId: 'tech_a', companyId: COMPANY, ...BASE, createdAt: at('07:30') },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

const asTech = (id = 'tech_a', companyId = COMPANY) => authHeader({ role: 'TECHNICIAN', userId: id, companyId });

describe('GET /schedule/my-route', () => {
    it("returns the tech's own and crew jobs for the day, ordered, without pricing", async () => {
        const res = await request(app).get(`/schedule/my-route?date=${DATE}`).set('Authorization', asTech());
        expect(res.status).toBe(200);
        const route = res.body.data.route;
        expect(route.stops.map((s: any) => s.jobId)).toEqual(['j_early', 'j_van', 'j_late', 'j_nogeo']);
        expect(route.stops[3].noLocation).toBe(true);
        expect(route.origin).toMatchObject({ lat: BASE.lat, lng: BASE.lng, source: 'lastPing' });
        expect(route.stops[0].leg.distanceKm).toBeCloseTo(8, 0);
        expect(route.totals).toMatchObject({ stops: 4, located: 3 });
        expect(route.totals.distanceKm).toBeGreaterThan(0);
        expect(route.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=/);
        expect(route.estimate).toMatchObject({ approximate: true, avgSpeedKmh: 35 });
        expect(JSON.stringify(res.body)).not.toContain('98765');
    });

    it('lets a technician request their own id but not another tech\'s route', async () => {
        const own = await request(app).get(`/schedule/my-route?date=${DATE}&techId=tech_a`).set('Authorization', asTech());
        expect(own.status).toBe(200);
        const other = await request(app).get(`/schedule/my-route?date=${DATE}&techId=tech_b`).set('Authorization', asTech());
        expect(other.status).toBe(403);
    });

    it('lets a dispatcher fetch any tech in their company', async () => {
        const res = await request(app)
            .get(`/schedule/my-route?date=${DATE}&techId=tech_b`)
            .set('Authorization', authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY }));
        expect(res.status).toBe(200);
        expect(res.body.data.route.stops.map((s: any) => s.jobId)).toEqual(['j_other_tech']);
    });

    it('isolates companies: an office user cannot read a tech from another company', async () => {
        const res = await request(app)
            .get(`/schedule/my-route?date=${DATE}&techId=tech_a`)
            .set('Authorization', authHeader({ role: 'ADMIN', userId: 'admin_x', companyId: OTHER }));
        expect(res.status).toBe(404);

        // A tech in the other company only ever sees their own company's jobs.
        const x = await request(app).get(`/schedule/my-route?date=${DATE}`).set('Authorization', asTech('tech_x', OTHER));
        expect(x.status).toBe(200);
        expect(x.body.data.route.stops).toEqual([]);
        expect(x.body.data.route.mapsUrl).toBeNull();
    });

    it('rejects a malformed date and roles outside field/office', async () => {
        const bad = await request(app).get('/schedule/my-route?date=03-11-2026').set('Authorization', asTech());
        expect(bad.status).toBe(400);
        const acct = await request(app)
            .get(`/schedule/my-route?date=${DATE}`)
            .set('Authorization', authHeader({ role: 'ACCOUNTANT', companyId: COMPANY }));
        expect(acct.status).toBe(403);
    });
});

describe('GET /public/track/:token ETA', () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

    function seedTracker(status: string, pingAgeMin: number) {
        fakePrisma.job.seed([
            job('j_track', {
                status,
                customerTrackingToken: 'tok_123',
                // Trip start: the tracker only uses fixes from after it.
                onMyWaySentAt: minutesAgo(60),
                property: property(7),
                tech: { firstName: 'Sipho', lastName: 'M', avatarUrl: null },
                company: { name: 'Mthembu Plumbing' },
            }),
        ]);
        fakePrisma.userLocationPing.rows = [
            { id: 'p_live', userId: 'tech_a', companyId: COMPANY, ...BASE, createdAt: minutesAgo(pingAgeMin) },
        ];
    }

    it('returns a live ETA while en route with a fresh ping', async () => {
        seedTracker('EN_ROUTE', 3);
        const res = await request(app).get('/public/track/tok_123');
        expect(res.status).toBe(200);
        expect(res.body.data.eta.basis).toBe('live');
        expect(res.body.data.eta.distanceKm).toBeCloseTo(7, 0);
        expect(res.body.data.eta.minutes).toBeGreaterThan(0);
    });

    it('returns no ETA for a stale ping or a job that is not en route', async () => {
        seedTracker('EN_ROUTE', 30);
        const stale = await request(app).get('/public/track/tok_123');
        expect(stale.body.data.eta).toEqual({ minutes: null, distanceKm: null, basis: 'none' });

        fakePrisma.$reset();
        seedTracker('ON_SITE', 1);
        const onSite = await request(app).get('/public/track/tok_123');
        expect(onSite.body.data.eta.basis).toBe('none');
    });
});
