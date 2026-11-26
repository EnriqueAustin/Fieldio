import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

vi.mock('../src/services/socket.service', () => ({
    socketService: { emitToCompany: vi.fn(), emitToUser: vi.fn() },
}));

vi.mock('../src/services/notifications/notification.service', () => ({
    notificationService: { notifyCustomer: vi.fn(), notifyUser: vi.fn(), notify: vi.fn() },
}));

vi.mock('../src/modules/jobs/summary-pdf.service', () => ({
    jobSummaryService: { generateAndSend: vi.fn().mockResolvedValue({}) },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { trackingRouter } from '../src/routes/tracking';
import { publicTrackerRouter } from '../src/routes/scheduling';
import { jobRouter } from '../src/routes/jobs';
import { notificationService } from '../src/services/notifications/notification.service';
import { socketService } from '../src/services/socket.service';
import {
    ETA_MAX_FIX_AGE_MS,
    ETA_MIN_MINUTES,
    estimateEtaMinutes,
    formatEta,
    haversineKm,
    roundEtaMinutes,
} from '../src/utils/eta';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use('/public/track', publicTrackerRouter);
    app.use(deserializeUser);
    app.use('/tracking', trackingRouter);
    app.use('/jobs', jobRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH = 'tech_1';
const OTHER_TECH = 'tech_2';
const VAN = 'van_1';
const TOKEN = 'tok_live';

const asTech = (userId = TECH) => authHeader({ role: 'TECHNICIAN', userId, companyId: COMPANY });

// Points along a parallel east of central Durban.
const BASE = { lat: -29.85, lng: 31.0 };
const KM_PER_DEG_LNG = 111.195 * Math.cos((BASE.lat * Math.PI) / 180);
const east = (km: number) => ({ lat: BASE.lat, lng: BASE.lng + km / KM_PER_DEG_LNG });
const SITE = east(7);

const minutesAgo = (m: number, now = new Date()) => new Date(now.getTime() - m * 60_000);

const notifyCustomer = vi.mocked(notificationService.notifyCustomer);
const emitToCompany = vi.mocked(socketService.emitToCompany);

const customer = { id: 'cust_1', name: 'Mthembu Residence', phone: '+27820000000' };

const seedJob = (overrides: Record<string, unknown> = {}) =>
    fakePrisma.job.seed([
        {
            id: 'job_1',
            companyId: COMPANY,
            techId: TECH,
            vanId: null,
            status: 'EN_ROUTE',
            title: 'Burst geyser',
            checklist: [],
            signatures: [],
            customerId: customer.id,
            customer,
            propertyId: 'prop_1',
            customerTrackingToken: TOKEN,
            scheduledStart: null,
            // Trip start: only fixes from after this are ever used.
            onMyWaySentAt: minutesAgo(60),
            // The fake doesn't resolve relations: the public tracker's includes
            // read these straight off the row.
            property: { addressLine1: '1 Marine Pde', city: 'Durban', geoLat: SITE.lat, geoLng: SITE.lng },
            tech: { firstName: 'Sipho', lastName: 'Ndlovu', avatarUrl: null },
            company: { name: 'Mthembu Plumbing', settings: { contact: { phone: '031 555 0100' } } },
            ...overrides,
        },
    ]);

const seedFix = (userId: string, ageMin: number, point = BASE) =>
    fakePrisma.userLocationPing.seed([
        { id: `ping_${userId}_${ageMin}`, userId, companyId: COMPANY, ...point, createdAt: minutesAgo(ageMin) },
    ]);

const ping = (body: Record<string, unknown>, auth = asTech()) =>
    request(app).post('/tracking/ping').set('Authorization', auth).send(body);

beforeEach(() => {
    fakePrisma.$reset();
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ETA util
// ---------------------------------------------------------------------------

describe('eta util', () => {
    const now = new Date('2026-11-24T08:00:00Z');
    const fixAt = (point: { lat: number; lng: number }, ageMin: number) => ({ ...point, createdAt: minutesAgo(ageMin, now) });

    it('estimates road time from a fresh fix with the road factor and urban speed', () => {
        // 5 km straight → 6.75 km road → 11.6 min → 12.
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 1), destination: east(5), now })).toBe(12);
        // 7 km → 16.2 min → 17 → rounded to 15.
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 1), destination: SITE, now })).toBe(15);
        // 20 km → 46.3 min → 47 → rounded to 45.
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 1), destination: east(20), now })).toBe(45);
        expect(haversineKm(BASE, SITE)).toBeCloseTo(7, 1);
    });

    it('never promises less than the minimum', () => {
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 0), destination: BASE, now })).toBe(ETA_MIN_MINUTES);
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 0), destination: east(1), now })).toBe(ETA_MIN_MINUTES);
    });

    it('rounds to 5 minutes only above 15', () => {
        expect(roundEtaMinutes(2.1)).toBe(3);
        expect(roundEtaMinutes(14.2)).toBe(15);
        expect(roundEtaMinutes(15)).toBe(15);
        expect(roundEtaMinutes(16)).toBe(15);
        expect(roundEtaMinutes(18)).toBe(20);
        expect(roundEtaMinutes(61)).toBe(60);
    });

    it('returns null for a stale fix, no fix, or a site without coordinates', () => {
        const staleMin = ETA_MAX_FIX_AGE_MS / 60_000 + 1;
        expect(estimateEtaMinutes({ fix: fixAt(BASE, staleMin), destination: SITE, now })).toBeNull();
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 4), destination: SITE, now })).not.toBeNull();
        expect(estimateEtaMinutes({ fix: null, destination: SITE, now })).toBeNull();
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 1), destination: { lat: null, lng: null }, now })).toBeNull();
        expect(estimateEtaMinutes({ fix: fixAt(BASE, 1), destination: null, now })).toBeNull();
        // A fix far in the future is a clock problem, not a live position.
        expect(estimateEtaMinutes({ fix: fixAt(BASE, -10), destination: SITE, now })).toBeNull();
    });

    it('formats labels for messages', () => {
        expect(formatEta(15)).toBe('15 min');
        expect(formatEta(60)).toBe('1 h');
        expect(formatEta(75)).toBe('1 h 15 min');
    });
});

// ---------------------------------------------------------------------------
// POST /tracking/ping guards
// ---------------------------------------------------------------------------

describe('POST /tracking/ping', () => {
    it('stores the fix for the token user while their job is en route', async () => {
        seedJob();
        // A spoofed userId in the body is ignored.
        const res = await ping({ ...BASE, accuracy: 12, jobId: 'job_1', userId: OTHER_TECH });

        expect(res.status).toBe(204);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(1);
        expect(fakePrisma.userLocationPing.rows[0]).toMatchObject({ userId: TECH, companyId: COMPANY, accuracy: 12 });
        expect(emitToCompany).toHaveBeenCalledWith(COMPANY, 'tech:location', expect.objectContaining({ userId: TECH }));
    });

    it("rejects a ping for another technician's job", async () => {
        seedJob({ techId: OTHER_TECH });
        const res = await ping({ ...BASE, jobId: 'job_1' });

        expect(res.status).toBe(403);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(0);
    });

    it('rejects a ping for a job in another company', async () => {
        seedJob({ companyId: 'company_2' });
        const res = await ping({ ...BASE, jobId: 'job_1' });
        expect(res.status).toBe(403);
    });

    it('collects nothing while the job is not en route', async () => {
        seedJob({ status: 'ASSIGNED' });
        expect((await ping({ ...BASE, jobId: 'job_1' })).status).toBe(409);
        expect((await ping({ ...BASE })).status).toBe(409);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(0);
    });

    it('accepts a van crew member driving to a van-only job', async () => {
        seedJob({ techId: null, vanId: VAN });
        fakePrisma.vanMember.seed([{ id: 'vm_1', vanId: VAN, userId: OTHER_TECH }]);

        const res = await ping({ ...BASE, jobId: 'job_1' }, asTech(OTHER_TECH));
        expect(res.status).toBe(204);
        expect((await ping({ ...BASE }, asTech(OTHER_TECH))).status).toBe(204);
        // Not on the crew → no access.
        expect((await ping({ ...BASE, jobId: 'job_1' })).status).toBe(403);
    });

    it('rejects out-of-range or malformed coordinates', async () => {
        seedJob();
        expect((await ping({ lat: 91, lng: 31 })).status).toBe(400);
        expect((await ping({ lat: -29.8, lng: 181 })).status).toBe(400);
        expect((await ping({ lat: 'abc', lng: 31 })).status).toBe(400);
        expect((await ping({ lng: 31 })).status).toBe(400);
        expect((await ping({ ...BASE, accuracy: -5 })).status).toBe(400);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(0);
    });

    it('keeps the 30s persistence throttle', async () => {
        seedJob();
        seedFix(TECH, 0.1);
        const res = await ping({ ...BASE, jobId: 'job_1' });

        expect(res.status).toBe(204);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(1);
        expect(emitToCompany).not.toHaveBeenCalled();
    });

    it('requires a signed-in user', async () => {
        const res = await request(app).post('/tracking/ping').send(BASE);
        expect(res.status).toBe(401);
    });
});

// ---------------------------------------------------------------------------
// GET /public/track/:token
// ---------------------------------------------------------------------------

describe('GET /public/track/:token', () => {
    it('shows the live position and ETA while en route', async () => {
        seedJob();
        seedFix(TECH, 1);
        const res = await request(app).get(`/public/track/${TOKEN}`);

        expect(res.status).toBe(200);
        const data = res.body.data;
        expect(data.job.status).toBe('EN_ROUTE');
        expect(data.techLocation).toMatchObject({ lat: BASE.lat, lng: BASE.lng });
        expect(data.techLocation.ageSeconds).toBeGreaterThanOrEqual(55);
        expect(data.etaMinutes).toBe(15);
        expect(data.eta).toMatchObject({ minutes: 15, basis: 'live' });
        expect(data.company).toEqual({ name: 'Mthembu Plumbing', phone: '031 555 0100' });
    });

    it("never reveals the tech's surname", async () => {
        seedJob();
        const res = await request(app).get(`/public/track/${TOKEN}`);
        expect(res.body.data.job.techName).toBe('Sipho');
        expect(JSON.stringify(res.body)).not.toContain('Ndlovu');
    });

    it.each(['ASSIGNED', 'ON_SITE', 'COMPLETED', 'PAUSED'])('hides the position while %s', async (status) => {
        seedJob({ status });
        seedFix(TECH, 1);
        const res = await request(app).get(`/public/track/${TOKEN}`);

        expect(res.status).toBe(200);
        expect(res.body.data.techLocation).toBeNull();
        expect(res.body.data.etaMinutes).toBeNull();
    });

    it('shows a recent fix without an ETA once it is too old to estimate from', async () => {
        seedJob();
        seedFix(TECH, 10);
        const res = await request(app).get(`/public/track/${TOKEN}`);

        expect(res.body.data.techLocation).not.toBeNull();
        expect(res.body.data.etaMinutes).toBeNull();
        expect(res.body.data.eta.basis).toBe('none');
    });

    it('never shows a fix from a previous trip', async () => {
        seedJob();
        seedFix(TECH, 45);
        const res = await request(app).get(`/public/track/${TOKEN}`);
        expect(res.body.data.techLocation).toBeNull();
    });

    it('never shows a fix from before this job went en route', async () => {
        // Fix from the drive to the previous customer, 2 min before this trip.
        seedJob({ onMyWaySentAt: minutesAgo(3) });
        seedFix(TECH, 5);
        const res = await request(app).get(`/public/track/${TOKEN}`);
        expect(res.body.data.techLocation).toBeNull();
        expect(res.body.data.etaMinutes).toBeNull();
    });

    it('shows nothing when the trip start is unknown', async () => {
        seedJob({ onMyWaySentAt: null });
        seedFix(TECH, 1);
        const res = await request(app).get(`/public/track/${TOKEN}`);
        expect(res.body.data.techLocation).toBeNull();
    });

    it("uses a crewmate's fix on a van job that also has a lead tech", async () => {
        seedJob({ vanId: VAN });
        fakePrisma.vanMember.seed([{ id: 'vm_1', vanId: VAN, userId: OTHER_TECH }]);
        seedFix(OTHER_TECH, 1);
        const res = await request(app).get(`/public/track/${TOKEN}`);
        expect(res.body.data.techLocation).toMatchObject({ lat: BASE.lat });
        expect(res.body.data.etaMinutes).toBe(15);
    });

    it('uses the van crew position for a van-only job', async () => {
        seedJob({ techId: null, vanId: VAN, tech: null });
        fakePrisma.vanMember.seed([{ id: 'vm_1', vanId: VAN, userId: OTHER_TECH }]);
        seedFix(OTHER_TECH, 1);
        const res = await request(app).get(`/public/track/${TOKEN}`);

        expect(res.body.data.techLocation).toMatchObject({ lat: BASE.lat });
        expect(res.body.data.job.techName).toBe('');
    });

    it('404s an unknown or deleted tracker', async () => {
        expect((await request(app).get('/public/track/nope')).status).toBe(404);
        seedJob({ deletedAt: new Date() });
        expect((await request(app).get(`/public/track/${TOKEN}`)).status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// En-route customer message
// ---------------------------------------------------------------------------

describe('en-route message ETA', () => {
    const startRoute = () =>
        request(app).patch('/jobs/job_1/status').set('Authorization', asTech()).send({ status: 'EN_ROUTE' });
    const enRoutePayload = () => notifyCustomer.mock.calls.find((c) => c[2] === 'JOB_EN_ROUTE')?.[3];

    beforeEach(() => {
        seedJob({ status: 'ASSIGNED', customerTrackingToken: null });
        fakePrisma.property.seed([{ id: 'prop_1', companyId: COMPANY, geoLat: SITE.lat, geoLng: SITE.lng }]);
    });

    it('ignores a fix from before the tap (e.g. the previous trip)', async () => {
        seedFix(TECH, 1);
        const res = await startRoute();

        expect(res.status).toBe(200);
        expect(enRoutePayload()).not.toHaveProperty('eta');
    });

    it('stamps the trip start on every move into EN_ROUTE', async () => {
        fakePrisma.job.rows[0].onMyWaySentAt = minutesAgo(120);
        await startRoute();
        const startedAt = new Date(fakePrisma.job.rows[0].onMyWaySentAt).getTime();
        expect(Date.now() - startedAt).toBeLessThan(5_000);
    });

    it('omits the ETA without a fresh fix', async () => {
        seedFix(TECH, 20);
        await startRoute();

        const payload = enRoutePayload();
        expect(payload).toBeDefined();
        expect(payload).not.toHaveProperty('eta');
    });

    it('omits the ETA when the site is not geocoded', async () => {
        fakePrisma.property.rows[0].geoLat = null;
        seedFix(TECH, 1);
        await startRoute();
        expect(enRoutePayload()).not.toHaveProperty('eta');
    });
});

// ---------------------------------------------------------------------------
// Location sent with "Start route" (PATCH /jobs/:id/status)
// ---------------------------------------------------------------------------

describe('start-route location', () => {
    const setStatus = (body: Record<string, unknown>, auth = asTech()) =>
        request(app).patch('/jobs/job_1/status').set('Authorization', auth).send(body);
    const enRoutePayload = () => notifyCustomer.mock.calls.find((c) => c[2] === 'JOB_EN_ROUTE')?.[3];
    const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: COMPANY });

    beforeEach(() => {
        seedJob({ status: 'ASSIGNED', customerTrackingToken: null });
        fakePrisma.property.seed([{ id: 'prop_1', companyId: COMPANY, geoLat: SITE.lat, geoLng: SITE.lng }]);
    });

    it('stores the fix and puts the ETA in the first en-route message', async () => {
        const res = await setStatus({ status: 'EN_ROUTE', location: { ...BASE, accuracy: 20 } });

        expect(res.status).toBe(200);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(1);
        expect(fakePrisma.userLocationPing.rows[0]).toMatchObject({ userId: TECH, companyId: COMPANY, lat: BASE.lat });
        expect(enRoutePayload()).toMatchObject({ eta: '15 min' });
        expect(emitToCompany).toHaveBeenCalledWith(COMPANY, 'tech:location', expect.objectContaining({ userId: TECH }));
    });

    it('ignores a location sent with any other status', async () => {
        seedFix(TECH, 60);
        const before = fakePrisma.userLocationPing.rows.length;
        const res = await setStatus({ status: 'ON_SITE', location: BASE });

        expect(res.status).toBe(200);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(before);
    });

    it('ignores a location from someone not driving the job', async () => {
        const res = await setStatus({ status: 'EN_ROUTE', location: BASE }, asOffice());

        expect(res.status).toBe(200);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(0);
        expect(enRoutePayload()).not.toHaveProperty('eta');
    });

    it('ignores a location on a stale replayed tap', async () => {
        const clientAt = new Date(Date.now() - 20 * 60_000).toISOString();
        const res = await setStatus({ status: 'EN_ROUTE', clientAt, location: BASE });

        expect(res.status).toBe(200);
        expect(fakePrisma.userLocationPing.rows).toHaveLength(0);
    });

    it('rejects out-of-range coordinates', async () => {
        const res = await setStatus({ status: 'EN_ROUTE', location: { lat: 95, lng: 31 } });
        expect(res.status).toBe(400);
        expect(fakePrisma.job.rows[0].status).toBe('ASSIGNED');
    });

    it('still works without a location', async () => {
        const res = await setStatus({ status: 'EN_ROUTE' });
        expect(res.status).toBe(200);
        expect(enRoutePayload()).not.toHaveProperty('eta');
    });
});

// ---------------------------------------------------------------------------
// Push deep links on job notifications
// ---------------------------------------------------------------------------

describe('job notification deep links', () => {
    const notifyUser = vi.mocked(notificationService.notifyUser);
    const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: COMPANY });

    it('links the newly assigned tech to the job and the old tech home', async () => {
        seedJob({ status: 'ASSIGNED' });
        const NEW_TECH = '77777777-7777-4777-8777-777777777777';
        fakePrisma.user.seed([{ id: NEW_TECH, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 't2@example.com' }]);

        const res = await request(app).patch('/jobs/job_1').set('Authorization', asOffice()).send({ techId: NEW_TECH });

        expect(res.status).toBe(200);
        expect(notifyUser).toHaveBeenCalledWith(
            NEW_TECH, COMPANY, 'JOB_ASSIGNED', expect.any(String), expect.any(String),
            { jobId: 'job_1', url: '/?job=job_1' },
        );
        expect(notifyUser).toHaveBeenCalledWith(
            TECH, COMPANY, 'ALERT', 'Job reassigned', expect.any(String), { jobId: 'job_1', url: '/' },
        );
    });
});
