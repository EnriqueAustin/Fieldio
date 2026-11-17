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

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/schedule', schedulingRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const OTHER = 'company_2';
const TECH = 'tech_1';

const asDispatcher = () => authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY });

// A window and its overlap, reused across cases.
const START = '2026-11-20T08:00:00.000Z';
const END = '2026-11-20T10:00:00.000Z';

const seedCustomerAndProperty = () => {
    fakePrisma.customer.seed([{ id: 'cust_1', companyId: COMPANY, name: 'Mthembu', deletedAt: null }]);
    fakePrisma.property.seed([
        { id: 'prop_1', companyId: COMPANY, customerId: 'cust_1', addressLine1: '1 Main Rd', city: 'JHB' },
    ]);
};

const seedActiveTech = (id = TECH, companyId = COMPANY) => {
    fakePrisma.user.seed([
        { id, companyId, role: 'TECHNICIAN', status: 'ACTIVE', firstName: 'Sipho', lastName: 'N', skills: [] },
    ]);
};

beforeEach(() => {
    fakePrisma.$reset();
});

// ---------------------------------------------------------------------------
// createJob — tenant safety + assignee validation (item 1)
// ---------------------------------------------------------------------------

describe('createJob', () => {
    it('ignores a companyId in the body (no tenant move)', async () => {
        seedCustomerAndProperty();
        const res = await request(app)
            .post('/schedule/jobs')
            .set('Authorization', asDispatcher())
            .send({
                companyId: OTHER, // attempt to plant into another tenant
                customerId: 'cust_1',
                propertyId: 'prop_1',
                title: 'Geyser swap',
                scheduledStart: START,
                scheduledEnd: END,
            });

        expect(res.status).toBe(201);
        expect(res.body.data.job.companyId).toBe(COMPANY);
        expect(fakePrisma.job.rows[0].companyId).toBe(COMPANY);
        expect(fakePrisma.job.rows[0].status).toBe('REQUESTED');
    });

    it('rejects a tech from another company (404)', async () => {
        seedCustomerAndProperty();
        seedActiveTech(TECH, OTHER); // tech belongs to a different tenant
        const res = await request(app)
            .post('/schedule/jobs')
            .set('Authorization', asDispatcher())
            .send({
                customerId: 'cust_1',
                propertyId: 'prop_1',
                title: 'Geyser swap',
                scheduledStart: START,
                scheduledEnd: END,
                techId: TECH,
            });

        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('rejects end <= start (400)', async () => {
        seedCustomerAndProperty();
        const res = await request(app)
            .post('/schedule/jobs')
            .set('Authorization', asDispatcher())
            .send({
                customerId: 'cust_1',
                propertyId: 'prop_1',
                title: 'Geyser swap',
                scheduledStart: END,
                scheduledEnd: START,
            });

        expect(res.status).toBe(400);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// updateSchedule — validation, conflicts, unassign (items 2, 3, 4)
// ---------------------------------------------------------------------------

describe('updateSchedule', () => {
    it('400s an invalid (non-ISO) date instead of 500', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'X' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledStart: 'not-a-date', scheduledEnd: END });

        expect(res.status).toBe(400);
    });

    it('rejects assigning a tech from another company (404)', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'X' },
        ]);
        seedActiveTech(TECH, OTHER);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: TECH });

        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows[0].techId).toBeNull();
    });

    it('rejects assigning a non-technician user (404)', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'X' },
        ]);
        // Right company, wrong role.
        fakePrisma.user.seed([{ id: 'office_u', companyId: COMPANY, role: 'OFFICE', status: 'ACTIVE' }]);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: 'office_u' });

        expect(res.status).toBe(404);
    });

    it('400s when the effective window has end <= start', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'X' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ scheduledStart: END, scheduledEnd: START });

        expect(res.status).toBe(400);
    });

    it('detects a tech conflict when only techId is sent against the job\'s existing window', async () => {
        // job_1 already has a window; job_2 fills that window for TECH.
        fakePrisma.job.seed([
            {
                id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'A',
                scheduledStart: new Date(START), scheduledEnd: new Date(END),
            },
            {
                id: 'job_2', companyId: COMPANY, techId: TECH, vanId: null, status: 'ASSIGNED', title: 'B',
                scheduledStart: new Date(START), scheduledEnd: new Date(END),
            },
        ]);
        seedActiveTech(TECH, COMPANY);

        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: TECH }); // no times — must use job_1's existing window

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/already booked/i);
        expect(fakePrisma.job.rows.find((j: any) => j.id === 'job_1').techId).toBeNull();
    });

    it('unassigning an ASSIGNED job drops it back to REQUESTED', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: TECH, vanId: null, status: 'ASSIGNED', title: 'X' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: null });

        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('REQUESTED');
        expect(res.body.data.job.techId).toBeNull();
    });

    it('409s an attempt to unassign a live (ON_SITE) job', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: TECH, vanId: null, status: 'ON_SITE', title: 'X' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_1')
            .set('Authorization', asDispatcher())
            .send({ techId: null });

        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe('ON_SITE');
        expect(fakePrisma.job.rows[0].techId).toBe(TECH);
    });
});

// ---------------------------------------------------------------------------
// getUnscheduled — only jobs needing dispatcher action (item 5)
// ---------------------------------------------------------------------------

describe('getUnscheduled', () => {
    it('excludes completed/canceled and scheduled+assigned jobs', async () => {
        const cust = { id: 'c', name: 'A', phone: '1' };
        const prop = { addressLine1: '1 St', city: 'JHB' };
        fakePrisma.job.seed([
            // Needs action: no time, no assignee.
            { id: 'job_req', companyId: COMPANY, status: 'REQUESTED', title: 'Req', priority: 'HIGH', techId: null, vanId: null, scheduledStart: null, requiredSkills: [], customer: cust, property: prop },
            // Already done — must not appear.
            { id: 'job_done', companyId: COMPANY, status: 'COMPLETED', title: 'Done', priority: 'LOW', techId: TECH, vanId: null, scheduledStart: new Date(START), requiredSkills: [], customer: cust, property: prop },
            // Canceled — must not appear.
            { id: 'job_cancel', companyId: COMPANY, status: 'CANCELED', title: 'Cx', priority: 'LOW', techId: null, vanId: null, scheduledStart: null, requiredSkills: [], customer: cust, property: prop },
            // REQUESTED but scheduled AND assigned — no action needed, must not appear.
            { id: 'job_sched', companyId: COMPANY, status: 'REQUESTED', title: 'Set', priority: 'LOW', techId: TECH, vanId: null, scheduledStart: new Date(START), requiredSkills: [], customer: cust, property: prop },
        ]);

        const res = await request(app)
            .get('/schedule/unscheduled')
            .set('Authorization', asDispatcher());

        expect(res.status).toBe(200);
        const ids = res.body.data.jobs.map((j: any) => j.id);
        expect(ids).toEqual(['job_req']);
    });
});
