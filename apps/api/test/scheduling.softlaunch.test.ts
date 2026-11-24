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

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { schedulingRouter } from '../src/routes/scheduling';
import { bookingsRouter } from '../src/routes/bookings';
import { notificationService } from '../src/services/notifications/notification.service';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/schedule', schedulingRouter);
    app.use('/bookings', bookingsRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH = 'tech_1';
const TECH_B = 'tech_2';
const VAN = 'van_1';

const asDispatcher = () => authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY });
const asTech = (userId = TECH) => authHeader({ role: 'TECHNICIAN', userId, companyId: COMPANY });

const at = (iso: string) => new Date(iso);
const START = '2026-11-20T08:00:00.000Z';
const END = '2026-11-20T10:00:00.000Z';

const customer = { id: 'cust_1', name: 'Mthembu', phone: '0820000000' };
const property = { addressLine1: '1 Main Rd', city: 'JHB' };

const seedTech = (id: string) =>
    fakePrisma.user.seed([
        { id, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', firstName: id, lastName: 'N', skills: [] },
    ]);

const seedVanWithCrew = (members: string[]) => {
    fakePrisma.van.seed([{ id: VAN, companyId: COMPANY, name: 'Van 1', active: true }]);
    fakePrisma.vanMember.seed(members.map((userId, i) => ({ id: `vm_${i}`, vanId: VAN, userId })));
};

const job = (overrides: Record<string, unknown>) => ({
    companyId: COMPANY,
    customerId: customer.id,
    title: 'Geyser swap',
    status: 'ASSIGNED',
    techId: null,
    vanId: null,
    scheduledStart: null,
    scheduledEnd: null,
    customerTrackingToken: null,
    actualStart: null,
    customer,
    property,
    ...overrides,
});

const notifyUser = vi.mocked(notificationService.notifyUser);
const notifyCustomer = vi.mocked(notificationService.notifyCustomer);
const notifiedUsers = () => notifyUser.mock.calls.map(([userId, , , title]) => ({ userId, title }));

beforeEach(() => {
    fakePrisma.$reset();
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// On my way — guarded, delegated to the status service
// ---------------------------------------------------------------------------

describe('POST /schedule/jobs/:id/on-my-way', () => {
    it("403s a technician who isn't on the job and leaves it untouched", async () => {
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH_B })]);

        const res = await request(app).post('/schedule/jobs/job_1/on-my-way').set('Authorization', asTech());

        expect(res.status).toBe(403);
        expect(fakePrisma.job.rows[0].status).toBe('ASSIGNED');
        expect(notifyCustomer).not.toHaveBeenCalled();
    });

    it('lets a van crew member mark a van job en route (tracker, TRAVEL clock, one message)', async () => {
        seedVanWithCrew([TECH]);
        fakePrisma.job.seed([job({ id: 'job_1', vanId: VAN })]);

        const res = await request(app).post('/schedule/jobs/job_1/on-my-way').set('Authorization', asTech());

        expect(res.status).toBe(200);
        const row = fakePrisma.job.rows[0];
        expect(row.status).toBe('EN_ROUTE');
        expect(row.customerTrackingToken).toEqual(expect.any(String));
        expect(res.body.data.token).toBe(row.customerTrackingToken);
        expect(res.body.data.trackingUrl).toContain(`/track/${row.customerTrackingToken}`);
        expect(fakePrisma.timeEntry.rows).toEqual([
            expect.objectContaining({ userId: TECH, jobId: 'job_1', type: 'TRAVEL' }),
        ]);
        expect(fakePrisma.timeEntry.rows[0].endTime ?? null).toBeNull();
        expect(notifyCustomer).toHaveBeenCalledTimes(1);
        expect(notifyCustomer).toHaveBeenCalledWith(customer.id, COMPANY, 'JOB_EN_ROUTE', expect.any(Object));
    });

    it.each(['COMPLETED', 'CANCELED', 'ON_SITE'])('409s a %s job instead of pushing it back to EN_ROUTE', async (status) => {
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH, status })]);

        const res = await request(app).post('/schedule/jobs/job_1/on-my-way').set('Authorization', asDispatcher());

        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe(status);
        expect(notifyCustomer).not.toHaveBeenCalled();
    });

    it('is a no-op for a job already en route — the customer is not texted twice', async () => {
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH, status: 'EN_ROUTE', customerTrackingToken: 'tok_1' })]);

        const res = await request(app).post('/schedule/jobs/job_1/on-my-way').set('Authorization', asTech());

        expect(res.status).toBe(200);
        expect(res.body.data.token).toBe('tok_1');
        expect(notifyCustomer).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Reschedule — crew notifications + reminder reset
// ---------------------------------------------------------------------------

describe('PATCH /schedule/jobs/:id notifications', () => {
    it('tells the new tech and the tech it was taken from on a reassign', async () => {
        seedTech(TECH);
        seedTech(TECH_B);
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH, scheduledStart: at(START), scheduledEnd: at(END) })]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: TECH_B });

        expect(res.status).toBe(200);
        expect(notifiedUsers()).toEqual(
            expect.arrayContaining([
                { userId: TECH_B, title: 'New job assigned' },
                { userId: TECH, title: 'Job reassigned' },
            ]),
        );
        expect(notifyUser).toHaveBeenCalledTimes(2);
    });

    it('tells the assigned tech when the time moves', async () => {
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH, scheduledStart: at(START), scheduledEnd: at(END) })]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledStart: '2026-11-21T08:00:00.000Z', scheduledEnd: '2026-11-21T10:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(notifyUser).toHaveBeenCalledTimes(1);
        const [userId, companyId, , title, message] = notifyUser.mock.calls[0];
        expect({ userId, companyId, title }).toEqual({ userId: TECH, companyId: COMPANY, title: 'Job moved' });
        expect(message).toMatch(/^Geyser swap → /);
    });

    it('tells every crew member when a van job moves', async () => {
        seedVanWithCrew([TECH, TECH_B]);
        fakePrisma.job.seed([job({ id: 'job_1', vanId: VAN, scheduledStart: at(START), scheduledEnd: at(END) })]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledEnd: '2026-11-20T11:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(notifiedUsers()).toEqual(
            expect.arrayContaining([
                { userId: TECH, title: 'Job moved' },
                { userId: TECH_B, title: 'Job moved' },
            ]),
        );
    });

    it('does not notify anyone when nothing about their day changed', async () => {
        fakePrisma.job.seed([job({ id: 'job_1', techId: TECH, scheduledStart: at(START), scheduledEnd: at(END) })]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledStart: START });

        expect(res.status).toBe(200);
        expect(notifyUser).not.toHaveBeenCalled();
    });

    it('resets the 24h/1h reminder flags when the start moves', async () => {
        const sent = at('2026-11-19T08:00:00.000Z');
        fakePrisma.job.seed([
            job({
                id: 'job_1', techId: TECH, scheduledStart: at(START), scheduledEnd: at(END),
                reminder24hSentAt: sent, reminder1hSentAt: sent,
            }),
        ]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledStart: '2026-11-20T09:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].reminder24hSentAt).toBeNull();
        expect(fakePrisma.job.rows[0].reminder1hSentAt).toBeNull();
    });

    it('keeps the reminder flags when only the end moves', async () => {
        const sent = at('2026-11-19T08:00:00.000Z');
        fakePrisma.job.seed([
            job({
                id: 'job_1', techId: TECH, scheduledStart: at(START), scheduledEnd: at(END),
                reminder24hSentAt: sent, reminder1hSentAt: sent,
            }),
        ]);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledEnd: '2026-11-20T11:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].reminder24hSentAt).toEqual(sent);
    });
});

// ---------------------------------------------------------------------------
// Conflicts — null end = one hour; van crew counts
// ---------------------------------------------------------------------------

describe('PATCH /schedule/jobs/:id conflicts', () => {
    it('409s against an existing job that has no end (treated as one hour)', async () => {
        seedTech(TECH);
        fakePrisma.job.seed([
            job({ id: 'job_1', status: 'REQUESTED', scheduledStart: at('2026-11-20T08:30:00.000Z'), scheduledEnd: at('2026-11-20T09:30:00.000Z') }),
            job({ id: 'job_2', techId: TECH, title: 'Recurring service', scheduledStart: at(START), scheduledEnd: null }),
        ]);

        const res = await request(app).patch('/schedule/jobs/job_1').set('Authorization', asDispatcher()).send({ techId: TECH });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Recurring service/);
    });

    it('409s when the job being moved has no end itself', async () => {
        seedTech(TECH);
        fakePrisma.job.seed([
            job({ id: 'job_1', status: 'REQUESTED', scheduledStart: at('2026-11-20T08:30:00.000Z'), scheduledEnd: null }),
            job({ id: 'job_2', techId: TECH, scheduledStart: at(START), scheduledEnd: at('2026-11-20T09:00:00.000Z') }),
        ]);

        const res = await request(app).patch('/schedule/jobs/job_1').set('Authorization', asDispatcher()).send({ techId: TECH });

        expect(res.status).toBe(409);
    });

    it('allows a slot after a null-end job has had its hour', async () => {
        seedTech(TECH);
        fakePrisma.job.seed([
            job({ id: 'job_1', status: 'REQUESTED', scheduledStart: at('2026-11-20T09:30:00.000Z'), scheduledEnd: at('2026-11-20T10:00:00.000Z') }),
            job({ id: 'job_2', techId: TECH, scheduledStart: at(START), scheduledEnd: null }),
        ]);

        const res = await request(app).patch('/schedule/jobs/job_1').set('Authorization', asDispatcher()).send({ techId: TECH });

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows.find((j: any) => j.id === 'job_1').techId).toBe(TECH);
    });

    it("409s a direct assignment while the tech's van is booked in that window", async () => {
        seedTech(TECH);
        seedVanWithCrew([TECH]);
        fakePrisma.job.seed([
            job({ id: 'job_1', status: 'REQUESTED', scheduledStart: at(START), scheduledEnd: at(END) }),
            job({ id: 'job_2', vanId: VAN, title: 'Van install', scheduledStart: at(START), scheduledEnd: at(END) }),
        ]);

        const res = await request(app).patch('/schedule/jobs/job_1').set('Authorization', asDispatcher()).send({ techId: TECH });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/van is already booked/i);
    });

    it('409s creating a scheduled job for a tech who is already booked', async () => {
        seedTech(TECH);
        fakePrisma.customer.seed([{ id: customer.id, companyId: COMPANY, name: customer.name, deletedAt: null }]);
        fakePrisma.property.seed([{ id: 'prop_1', companyId: COMPANY, customerId: customer.id, ...property }]);
        fakePrisma.job.seed([job({ id: 'job_2', techId: TECH, scheduledStart: at(START), scheduledEnd: null })]);

        const res = await request(app)
            .post('/schedule/jobs')
            .set('Authorization', asDispatcher())
            .send({
                customerId: customer.id, propertyId: 'prop_1', title: 'New call-out',
                scheduledStart: '2026-11-20T08:30:00.000Z', scheduledEnd: '2026-11-20T09:30:00.000Z', techId: TECH,
            });

        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(1);
        expect(notifyUser).not.toHaveBeenCalled();
    });

    it('409s booking a van while one of its crew has a direct job then', async () => {
        seedVanWithCrew([TECH]);
        fakePrisma.job.seed([
            job({ id: 'job_1', status: 'REQUESTED', scheduledStart: at(START), scheduledEnd: at(END) }),
            job({ id: 'job_2', techId: TECH, title: 'Solo call-out', scheduledStart: at(START), scheduledEnd: at(END) }),
        ]);

        const res = await request(app).patch('/schedule/jobs/job_1').set('Authorization', asDispatcher()).send({ vanId: VAN });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/crew member is already booked/i);
    });
});

// ---------------------------------------------------------------------------
// My week — overlap, not "fits inside"
// ---------------------------------------------------------------------------

describe('GET /schedule/my-week', () => {
    it('includes null-end and straddling jobs, excludes other techs and out-of-range jobs', async () => {
        fakePrisma.job.seed([
            job({ id: 'null_end', techId: TECH, scheduledStart: at('2026-11-18T09:00:00.000Z'), scheduledEnd: null }),
            job({ id: 'straddle', techId: TECH, status: 'PAUSED', scheduledStart: at('2026-11-14T08:00:00.000Z'), scheduledEnd: at('2026-11-17T16:00:00.000Z') }),
            job({ id: 'other_tech', techId: TECH_B, scheduledStart: at('2026-11-18T09:00:00.000Z'), scheduledEnd: at('2026-11-18T10:00:00.000Z') }),
            job({ id: 'next_week', techId: TECH, scheduledStart: at('2026-11-24T09:00:00.000Z'), scheduledEnd: at('2026-11-24T10:00:00.000Z') }),
            job({ id: 'last_week', techId: TECH, scheduledStart: at('2026-11-12T09:00:00.000Z'), scheduledEnd: at('2026-11-12T10:00:00.000Z') }),
        ]);

        const res = await request(app)
            .get('/schedule/my-week')
            .query({ start: '2026-11-16T00:00:00.000Z', end: '2026-11-23T00:00:00.000Z' })
            .set('Authorization', asTech());

        expect(res.status).toBe(200);
        const events = res.body.data.events;
        expect(events.map((e: any) => e.id).sort()).toEqual(['null_end', 'straddle']);
        const nullEnd = events.find((e: any) => e.id === 'null_end');
        expect(nullEnd.end).toBe('2026-11-18T10:00:00.000Z');
    });
});

// ---------------------------------------------------------------------------
// Booking convert — end set, never runs twice
// ---------------------------------------------------------------------------

describe('POST /bookings/:id/convert', () => {
    it('creates a one-hour job and 409s a second convert', async () => {
        fakePrisma.bookingRequest.seed([
            {
                id: 'bk_1', companyId: COMPANY, status: 'NEW', name: 'Thandi', email: null, phone: '0821111111',
                description: 'Leaking geyser', serviceType: 'Geyser', preferredDate: at(START), customerId: null,
            },
        ]);

        const first = await request(app).post('/bookings/bk_1/convert').set('Authorization', asDispatcher());
        expect(first.status).toBe(201);
        expect(fakePrisma.job.rows).toHaveLength(1);
        expect(fakePrisma.job.rows[0].scheduledEnd).toEqual(at('2026-11-20T09:00:00.000Z'));
        expect(fakePrisma.bookingRequest.rows[0].status).toBe('CONVERTED');

        const second = await request(app).post('/bookings/bk_1/convert').set('Authorization', asDispatcher());
        expect(second.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(1);
        expect(fakePrisma.customer.rows).toHaveLength(1);
    });
});
