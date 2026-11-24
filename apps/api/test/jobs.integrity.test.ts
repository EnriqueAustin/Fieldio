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
import { jobRouter } from '../src/routes/jobs';
import { projectsRouter } from '../src/routes/projects';
import { schedulingRouter } from '../src/routes/scheduling';

// The shared fake registers a `project` table (test/helpers/fakePrisma.ts).
const projectTable = (fakePrisma as any).project;

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use('/projects', projectsRouter);
    app.use('/schedule', schedulingRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const OTHER = 'company_2';
const OWNER = 'tech_owner';
const OTHER_TECH = 'tech_other';
const MATE = 'tech_mate';

const asTech = (userId: string) => authHeader({ role: 'TECHNICIAN', userId, companyId: COMPANY });
const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: COMPANY });
const asDispatcher = () => authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY });
const asAdmin = () => authHeader({ role: 'ADMIN', userId: 'admin_1', companyId: COMPANY });

beforeEach(() => {
    fakePrisma.$reset();
});

// ---------------------------------------------------------------------------
// 1. Assignment guard on technician job mutations
// ---------------------------------------------------------------------------

describe('technician assignment guard', () => {
    it('403s a status change on a job assigned to another tech', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: OWNER, vanId: null, status: 'ASSIGNED', title: 'Geyser', checklist: [], signatures: [], customerId: 'cust_1' },
        ]);
        const res = await request(app)
            .patch('/jobs/job_1/status')
            .set('Authorization', asTech(OTHER_TECH))
            .send({ status: 'EN_ROUTE' });
        expect(res.status).toBe(403);
        // The job is untouched.
        expect(fakePrisma.job.rows[0].status).toBe('ASSIGNED');
    });

    it('lets a van crew mate drive the status of the van job', async () => {
        fakePrisma.job.seed([
            { id: 'job_v', companyId: COMPANY, techId: null, vanId: 'van_1', status: 'ASSIGNED', title: 'Van job', checklist: [], signatures: [], customerId: 'cust_1' },
        ]);
        fakePrisma.vanMember.seed([{ id: 'vm_1', userId: MATE, vanId: 'van_1' }]);

        const res = await request(app)
            .patch('/jobs/job_v/status')
            .set('Authorization', asTech(MATE))
            .send({ status: 'EN_ROUTE' });

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('EN_ROUTE');
        // Crew hours credited to the actor, not the (absent) job.techId.
        const entry = fakePrisma.timeEntry.rows.find((e: any) => e.jobId === 'job_v');
        expect(entry?.userId).toBe(MATE);
        expect(entry?.type).toBe('TRAVEL');
    });
});

// ---------------------------------------------------------------------------
// 2. Checklist toggle is scoped to the job (no cross-tenant/cross-job write)
// ---------------------------------------------------------------------------

describe('checklist toggle scoping', () => {
    it('404s when the checklist id belongs to a different job', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: OWNER, vanId: null, status: 'ON_SITE', title: 'A', checklist: [], signatures: [], customerId: 'cust_1' },
        ]);
        // A checklist row that belongs to another job (and could be another tenant's).
        fakePrisma.jobChecklist.seed([{ id: 'chk_x', jobId: 'job_2', label: 'Other job step', isCompleted: false }]);

        const res = await request(app)
            .patch('/jobs/job_1/checklist/chk_x')
            .set('Authorization', asTech(OWNER))
            .send({ isCompleted: true });

        expect(res.status).toBe(404);
        // The foreign row was never flipped.
        expect(fakePrisma.jobChecklist.rows[0].isCompleted).toBe(false);
    });

    it('toggles an item that does belong to the job', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: OWNER, vanId: null, status: 'ON_SITE', title: 'A', checklist: [], signatures: [], customerId: 'cust_1' },
        ]);
        fakePrisma.jobChecklist.seed([{ id: 'chk_1', jobId: 'job_1', label: 'Bleed the line', isCompleted: false }]);

        const res = await request(app)
            .patch('/jobs/job_1/checklist/chk_1')
            .set('Authorization', asTech(OWNER))
            .send({ isCompleted: true });

        expect(res.status).toBe(200);
        expect(fakePrisma.jobChecklist.rows[0].isCompleted).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 3. Reschedule does not reset status / refuses terminal jobs
// ---------------------------------------------------------------------------

describe('reschedule', () => {
    const times = { scheduledStart: '2026-11-20T08:00:00.000Z', scheduledEnd: '2026-11-20T10:00:00.000Z' };

    it('409s a reschedule of a COMPLETED job', async () => {
        fakePrisma.job.seed([
            { id: 'job_done', companyId: COMPANY, techId: OWNER, vanId: null, status: 'COMPLETED', title: 'Done' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_done')
            .set('Authorization', asDispatcher())
            .send(times);
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
    });

    it('keeps an ON_SITE job on site when the office moves it', async () => {
        fakePrisma.job.seed([
            { id: 'job_live', companyId: COMPANY, techId: OWNER, vanId: null, status: 'ON_SITE', title: 'Live' },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_live')
            .set('Authorization', asDispatcher())
            .send(times);
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('ON_SITE');
    });

    it('promotes an unassigned REQUESTED job to ASSIGNED when a tech is dropped on it', async () => {
        fakePrisma.job.seed([
            { id: 'job_req', companyId: COMPANY, techId: null, vanId: null, status: 'REQUESTED', title: 'New' },
        ]);
        // The assignee must be a real, active technician in the company.
        fakePrisma.user.seed([{ id: OWNER, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE' }]);
        const res = await request(app)
            .patch('/schedule/jobs/job_req')
            .set('Authorization', asDispatcher())
            .send({ ...times, techId: OWNER });
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('ASSIGNED');
        expect(res.body.data.job.techId).toBe(OWNER);
    });

    it('detects a van double-booking', async () => {
        fakePrisma.job.seed([
            { id: 'job_a', companyId: COMPANY, techId: null, vanId: 'van_1', status: 'ASSIGNED', title: 'A' },
            // job_b must actually occupy the window: an unscheduled job can't clash.
            {
                id: 'job_b', companyId: COMPANY, techId: null, vanId: 'van_1', status: 'ASSIGNED', title: 'B',
                scheduledStart: new Date(times.scheduledStart), scheduledEnd: new Date(times.scheduledEnd),
            },
        ]);
        const res = await request(app)
            .patch('/schedule/jobs/job_a')
            .set('Authorization', asDispatcher())
            .send(times);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Van is already booked/);
    });
});

// ---------------------------------------------------------------------------
// 4. Office cancel + reopen
// ---------------------------------------------------------------------------

describe('office cancel', () => {
    it('cancels an in-flight job and records timeline + audit', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, techId: OWNER, vanId: null, status: 'ASSIGNED', title: 'Callout' },
        ]);
        const res = await request(app)
            .post('/jobs/job_1/cancel')
            .set('Authorization', asOffice())
            .send({ reason: 'Customer cancelled' });

        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('CANCELED');
        expect(fakePrisma.jobTimelineEvent.rows.some((e: any) => e.type === 'CANCELED' && e.message === 'Customer cancelled')).toBe(true);
        expect(fakePrisma.auditLog.rows.some((a: any) => a.action === 'JOB_CANCELED')).toBe(true);
    });

    it('rejects a reason that is too short (zod)', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, status: 'ASSIGNED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/cancel')
            .set('Authorization', asOffice())
            .send({ reason: 'no' });
        expect(res.status).toBe(400);
    });

    it('409s cancelling a job that is already canceled', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, status: 'CANCELED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/cancel')
            .set('Authorization', asOffice())
            .send({ reason: 'Again please' });
        expect(res.status).toBe(409);
    });

    it('409s cancelling a completed job with a live invoice', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, status: 'COMPLETED', title: 'X' }]);
        fakePrisma.invoice.seed([{ id: 'inv_1', jobId: 'job_1', companyId: COMPANY, status: 'SENT', subtotal: 100, tax: 15, total: 115, balance: 115 }]);
        const res = await request(app)
            .post('/jobs/job_1/cancel')
            .set('Authorization', asOffice())
            .send({ reason: 'Trying to cancel' });
        expect(res.status).toBe(409);
    });

    it('stops an open clock on cancel (hours stay derived)', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: OWNER, status: 'ON_SITE', title: 'X' }]);
        fakePrisma.timeEntry.seed([{ id: 'te_1', companyId: COMPANY, jobId: 'job_1', userId: OWNER, type: 'WRENCH', startTime: new Date('2026-11-11T08:00:00.000Z'), endTime: null }]);
        const res = await request(app)
            .post('/jobs/job_1/cancel')
            .set('Authorization', asOffice())
            .send({ reason: 'Called off' });
        expect(res.status).toBe(200);
        expect(fakePrisma.timeEntry.rows[0].endTime).toBeTruthy();
    });
});

describe('office reopen', () => {
    it('reopens a canceled job with a tech back to ASSIGNED', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: OWNER, vanId: null, status: 'CANCELED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/reopen')
            .set('Authorization', asAdmin())
            .send({ reason: 'Customer called back' });
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('ASSIGNED');
        expect(fakePrisma.jobTimelineEvent.rows.some((e: any) => e.type === 'REOPENED')).toBe(true);
        expect(fakePrisma.auditLog.rows.some((a: any) => a.action === 'JOB_REOPENED')).toBe(true);
    });

    it('reopens an unassigned canceled job to REQUESTED', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: null, vanId: null, status: 'CANCELED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/reopen')
            .set('Authorization', asAdmin())
            .send({ reason: 'Back on' });
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('REQUESTED');
    });

    it('409s reopening an in-flight (ASSIGNED) job', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: OWNER, status: 'ASSIGNED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/reopen')
            .set('Authorization', asAdmin())
            .send({ reason: 'Nope' });
        expect(res.status).toBe(409);
    });

    it('is forbidden for a DISPATCHER (reopen is ADMIN/OFFICE only)', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, status: 'CANCELED', title: 'X' }]);
        const res = await request(app)
            .post('/jobs/job_1/reopen')
            .set('Authorization', asDispatcher())
            .send({ reason: 'Please' });
        expect(res.status).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// 5. Backwards status move: no-op for techs, 409 for the office
// ---------------------------------------------------------------------------

describe('backwards status move', () => {
    it('is a silent no-op for a technician (offline replay)', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: OWNER, status: 'COMPLETED', title: 'X', checklist: [], signatures: [], customerId: 'cust_1' }]);
        const res = await request(app)
            .patch('/jobs/job_1/status')
            .set('Authorization', asTech(OWNER))
            .send({ status: 'EN_ROUTE' });
        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
    });

    it('409s "Use reopen" for an office role', async () => {
        fakePrisma.job.seed([{ id: 'job_1', companyId: COMPANY, techId: OWNER, status: 'COMPLETED', title: 'X', checklist: [], signatures: [], customerId: 'cust_1' }]);
        const res = await request(app)
            .patch('/jobs/job_1/status')
            .set('Authorization', asOffice())
            .send({ status: 'ASSIGNED' });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/reopen/i);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
    });
});

// ---------------------------------------------------------------------------
// 6. Projects create: customer + site required, foreign ids rejected, no tenant move
// ---------------------------------------------------------------------------

describe('projects create', () => {
    const OWN_CUSTOMER = '22222222-2222-4222-8222-222222222222';
    const OWN_PROPERTY = '33333333-3333-4333-8333-333333333333';
    const seedOwnSite = () => {
        fakePrisma.customer.seed([{ id: OWN_CUSTOMER, companyId: COMPANY, name: 'Mall Co' }]);
        fakePrisma.property.seed([{ id: OWN_PROPERTY, companyId: COMPANY, customerId: OWN_CUSTOMER, addressLine1: '1 Main Rd' }]);
    };

    it('400s with a clear message when the dialog sends empty customer/site ids', async () => {
        // Project.customerId/propertyId are NOT NULL: an empty id must never reach the insert.
        const res = await request(app)
            .post('/projects')
            .set('Authorization', asOffice())
            .send({ name: 'Mall refit', description: 'Phase 1', budget: 50000, customerId: '', propertyId: '' });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toMatch(/Choose a customer/);
        expect(projectTable.rows).toHaveLength(0);
    });

    it('creates a project for a customer and site in the caller\'s company', async () => {
        seedOwnSite();
        const res = await request(app)
            .post('/projects')
            .set('Authorization', asOffice())
            .send({ name: 'Mall refit', budget: 50000, customerId: OWN_CUSTOMER, propertyId: OWN_PROPERTY });

        expect(res.status).toBe(201);
        expect(res.body.data.project.companyId).toBe(COMPANY);
        expect(res.body.data.project.customerId).toBe(OWN_CUSTOMER);
    });

    it('rejects a customerId that belongs to another company', async () => {
        seedOwnSite();
        const foreignCustomer = '11111111-1111-4111-8111-111111111111';
        fakePrisma.customer.seed([{ id: foreignCustomer, companyId: OTHER, name: 'Not yours' }]);

        const res = await request(app)
            .post('/projects')
            .set('Authorization', asOffice())
            .send({ name: 'Sneaky', customerId: foreignCustomer, propertyId: OWN_PROPERTY });

        expect(res.status).toBe(404);
        expect(projectTable.rows).toHaveLength(0);
    });

    it('never lets the body set companyId (tenant move)', async () => {
        seedOwnSite();
        const res = await request(app)
            .post('/projects')
            .set('Authorization', asOffice())
            .send({ name: 'Scoped', customerId: OWN_CUSTOMER, propertyId: OWN_PROPERTY, companyId: OTHER });

        expect(res.status).toBe(201);
        expect(res.body.data.project.companyId).toBe(COMPANY);
    });
});
