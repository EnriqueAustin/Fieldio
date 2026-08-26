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
    notificationService: { notifyCustomer: vi.fn(), notify: vi.fn() },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';
import { timeTrackingRouter } from '../src/routes/timeTracking';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use('/time-tracking', timeTrackingRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH = 'user_1';
const JOB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const tech = () => authHeader({ role: 'TECHNICIAN', userId: TECH });

const openEntries = () => fakePrisma.timeEntry.rows.filter((e: any) => !e.endTime);

/** Drive a job to a status the way the field console does. */
const setStatus = (jobId: string, status: string) =>
    request(app).patch(`/jobs/${jobId}/status`).set('Authorization', tech()).send({ status });

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.job.seed([
        { id: JOB_A, companyId: COMPANY, techId: TECH, status: 'ASSIGNED', title: 'Job A', checklist: [], customerId: 'cust_1' },
        { id: JOB_B, companyId: COMPANY, techId: TECH, status: 'ASSIGNED', title: 'Job B', checklist: [], customerId: 'cust_1' },
    ]);
});

describe('hours are derived from job status, not entered by hand', () => {
    it('starts travel on the way and swaps to on-site time on arrival', async () => {
        await setStatus(JOB_A, 'EN_ROUTE');
        expect(openEntries()).toHaveLength(1);
        expect(openEntries()[0]).toMatchObject({ type: 'TRAVEL', jobId: JOB_A });

        await setStatus(JOB_A, 'ON_SITE');
        const open = openEntries();
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({ type: 'WRENCH', jobId: JOB_A });

        // The travel leg is closed and measured, not discarded.
        const travel = fakePrisma.timeEntry.rows.find((e: any) => e.type === 'TRAVEL');
        expect(travel.endTime).toBeTruthy();
        expect(travel.duration).toBeGreaterThanOrEqual(0);
    });

    it('stops the clock when the job is completed', async () => {
        await setStatus(JOB_A, 'EN_ROUTE');
        await setStatus(JOB_A, 'ON_SITE');
        await setStatus(JOB_A, 'COMPLETED');

        expect(openEntries()).toHaveLength(0);
        expect(fakePrisma.timeEntry.rows.every((e: any) => e.endTime)).toBe(true);
    });

    it('never runs two clocks at once when a technician moves to the next job', async () => {
        // The regression: heading to job B while job A is still marked on site
        // used to leave both entries open, billing every minute twice.
        await setStatus(JOB_A, 'EN_ROUTE');
        await setStatus(JOB_A, 'ON_SITE');
        await setStatus(JOB_B, 'EN_ROUTE');

        const open = openEntries();
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({ type: 'TRAVEL', jobId: JOB_B });

        // Job A's on-site time was closed out rather than left running.
        const jobAWrench = fakePrisma.timeEntry.rows.find(
            (e: any) => e.jobId === JOB_A && e.type === 'WRENCH'
        );
        expect(jobAWrench.endTime).toBeTruthy();
    });

    it('is idempotent: re-sending the same status keeps one clock running', async () => {
        await setStatus(JOB_A, 'EN_ROUTE');
        const first = openEntries()[0];

        // A retried offline mutation, or the office re-applying the status.
        await setStatus(JOB_A, 'EN_ROUTE');
        await setStatus(JOB_A, 'EN_ROUTE');

        const open = openEntries();
        expect(open).toHaveLength(1);
        // Same entry, not a fresh one — the elapsed travel time is preserved.
        expect(open[0].id).toBe(first.id);
        expect(fakePrisma.timeEntry.rows.filter((e: any) => e.type === 'TRAVEL')).toHaveLength(1);
    });
});

describe('technicians cannot log or edit their own hours', () => {
    it('refuses manual clock-in from the field', async () => {
        const res = await request(app)
            .post('/time-tracking/start')
            .set('Authorization', tech())
            .send({ type: 'ADMIN' });

        expect(res.status).toBe(403);
    });

    it.each(['patch', 'delete'] as const)('refuses to let a technician %s an entry', async (verb) => {
        const res = await request(app)
            [verb]('/time-tracking/some-entry-id')
            .set('Authorization', tech())
            .send({ description: 'nudge' });

        expect(res.status).toBe(403);
    });

    it('lets the office correct a technician entry they do not own', async () => {
        fakePrisma.timeEntry.seed([
            { id: 'entry_1', companyId: COMPANY, userId: TECH, type: 'WRENCH', startTime: new Date(), endTime: null },
        ]);

        const res = await request(app)
            .post('/time-tracking/entry_1/stop')
            .set('Authorization', authHeader({ role: 'OFFICE', userId: 'user_office' }));

        expect(res.status).toBe(200);
        expect(openEntries()).toHaveLength(0);
    });

    it('still shows a technician their own derived summary', async () => {
        await setStatus(JOB_A, 'EN_ROUTE');

        const res = await request(app)
            .get('/time-tracking/summary/me')
            .set('Authorization', tech());

        expect(res.status).toBe(200);
        expect(res.body.data.active).toMatchObject({ type: 'TRAVEL' });
        expect(res.body.data.today).toHaveProperty('onSite');
        expect(res.body.data.week).toHaveProperty('total');
    });
});
