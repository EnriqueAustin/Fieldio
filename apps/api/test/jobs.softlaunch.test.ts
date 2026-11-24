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

// The leave-behind PDF goes to the customer on a field completion.
vi.mock('../src/modules/jobs/summary-pdf.service', () => ({
    jobSummaryService: { generateAndSend: vi.fn().mockResolvedValue({}) },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { jobSummaryService } from '../src/modules/jobs/summary-pdf.service';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';
import { timeTrackingRouter } from '../src/routes/timeTracking';
import { notificationService } from '../src/services/notifications/notification.service';

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
const OTHER = 'company_2';
const TECH = '99999999-9999-4999-8999-999999999999';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
const FOREIGN_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const FOREIGN_VAN_ID = '44444444-4444-4444-8444-444444444444';
const FOREIGN_PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const TEMPLATE_ID = '66666666-6666-4666-8666-666666666666';

const asTech = () => authHeader({ role: 'TECHNICIAN', userId: TECH, companyId: COMPANY });
const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: COMPANY });
const asDispatcher = () => authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY });

const notifyCustomer = vi.mocked(notificationService.notifyCustomer);
const customerMessageTypes = () => notifyCustomer.mock.calls.map((c) => c[2]);

const openEntries = () => fakePrisma.timeEntry.rows.filter((e: any) => !e.endTime);
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const setStatus = (jobId: string, status: string, auth = asTech(), clientAt?: string) =>
    request(app).patch(`/jobs/${jobId}/status`).set('Authorization', auth).send({ status, ...(clientAt ? { clientAt } : {}) });

const seedJob = (overrides: Record<string, unknown> = {}) =>
    fakePrisma.job.seed([
        {
            id: 'job_1', companyId: COMPANY, techId: TECH, vanId: null, status: 'ASSIGNED',
            title: 'Burst geyser', checklist: [], signatures: [], customerId: CUSTOMER_ID,
            // The fake doesn't resolve relations; the customer must be on the row
            // or the service's customer-message branches never run.
            customer: { id: CUSTOMER_ID, name: 'Mthembu Residence', phone: '+27820000000' },
            ...overrides,
        },
    ]);

beforeEach(() => {
    fakePrisma.$reset();
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. PAUSED status: clock stops on pause, restarts on resume
// ---------------------------------------------------------------------------

describe('PAUSED status', () => {
    it('ON_SITE → PAUSED closes the on-site clock and messages nobody', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'EN_ROUTE');
        await setStatus('job_1', 'ON_SITE');
        notifyCustomer.mockClear();

        const res = await setStatus('job_1', 'PAUSED');

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('PAUSED');
        expect(openEntries()).toHaveLength(0);
        const wrench = fakePrisma.timeEntry.rows.find((e: any) => e.type === 'WRENCH');
        expect(wrench.endTime).toBeTruthy();
        expect(notifyCustomer).not.toHaveBeenCalled();
    });

    it('closes the clock at the tap time when an offline pause replays', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'ON_SITE', asTech(), hoursAgo(3));
        const pausedAt = hoursAgo(2);

        await setStatus('job_1', 'PAUSED', asTech(), pausedAt);

        const wrench = fakePrisma.timeEntry.rows.find((e: any) => e.type === 'WRENCH');
        expect(new Date(wrench.endTime).toISOString()).toBe(pausedAt);
        expect(wrench.duration).toBe(60 * 60);
    });

    it('PAUSED → ON_SITE opens a fresh on-site entry without re-announcing arrival', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'ON_SITE');
        // Control: the first real arrival does notify the customer.
        expect(customerMessageTypes()).toContain('JOB_STARTED');
        await setStatus('job_1', 'PAUSED');
        notifyCustomer.mockClear();

        const res = await setStatus('job_1', 'ON_SITE');

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('ON_SITE');
        const open = openEntries();
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({ type: 'WRENCH', jobId: 'job_1' });
        expect(fakePrisma.timeEntry.rows.filter((e: any) => e.type === 'WRENCH')).toHaveLength(2);
        expect(customerMessageTypes()).not.toContain('JOB_STARTED');
    });

    it('PAUSED → EN_ROUTE starts travel and sends the normal en-route message', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'ON_SITE');
        await setStatus('job_1', 'PAUSED');
        notifyCustomer.mockClear();

        const res = await setStatus('job_1', 'EN_ROUTE');

        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('EN_ROUTE');
        expect(openEntries()).toHaveLength(1);
        expect(openEntries()[0]).toMatchObject({ type: 'TRAVEL', jobId: 'job_1' });
        expect(customerMessageTypes()).toContain('JOB_EN_ROUTE');
    });

    it('PAUSED → COMPLETED still requires the customer signature for a tech', async () => {
        seedJob({ status: 'PAUSED' });
        const blocked = await setStatus('job_1', 'COMPLETED');
        expect(blocked.status).toBe(400);
        expect(fakePrisma.job.rows[0].status).toBe('PAUSED');

        fakePrisma.job.rows[0].signatures = [{ id: 'sig_1', signerName: 'Customer', signedAt: new Date() }];
        const done = await setStatus('job_1', 'COMPLETED');
        expect(done.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
    });

    it.each(['ASSIGNED', 'EN_ROUTE'])('refuses to pause a job that is %s (409)', async (from) => {
        seedJob({ status: from });
        const res = await setStatus('job_1', 'PAUSED');
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe(from);
    });

    it('absorbs a stale pause that lands after completion (tech replay)', async () => {
        seedJob({ status: 'COMPLETED' });
        const res = await setStatus('job_1', 'PAUSED');
        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
        expect(fakePrisma.timeEntry.rows).toHaveLength(0);
    });

    it('409s the office moving a paused job back to ASSIGNED', async () => {
        seedJob({ status: 'PAUSED' });
        const res = await setStatus('job_1', 'ASSIGNED', asOffice());
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe('PAUSED');
    });

    it('a long pause is not flagged by the 12h runaway-clock cut', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'ON_SITE', asTech(), hoursAgo(20));
        await setStatus('job_1', 'PAUSED', asTech(), hoursAgo(19));

        const res = await request(app).get('/time-tracking/summary/me').set('Authorization', asTech());

        expect(res.status).toBe(200);
        const wrench = fakePrisma.timeEntry.rows.find((e: any) => e.type === 'WRENCH');
        expect(wrench.duration).toBe(60 * 60);
        expect(wrench.description ?? '').not.toMatch(/needs review/);
        expect(res.body.data.active).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 2. Office completion without field events
// ---------------------------------------------------------------------------

describe('POST /jobs/:id/complete (office)', () => {
    it('completes the job, stops its clock, creates no hours and messages no customer', async () => {
        seedJob({ status: 'ON_SITE' });
        fakePrisma.timeEntry.seed([
            { id: 'te_job', companyId: COMPANY, jobId: 'job_1', userId: TECH, type: 'WRENCH', startTime: new Date(Date.now() - 60 * 60 * 1000), endTime: null },
            // A clock on a different job must be left alone.
            { id: 'te_other', companyId: COMPANY, jobId: 'job_2', userId: 'tech_2', type: 'TRAVEL', startTime: new Date(), endTime: null },
        ]);

        const res = await request(app)
            .post('/jobs/job_1/complete')
            .set('Authorization', asOffice())
            .send({ note: 'Customer confirmed by phone' });

        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('COMPLETED');
        expect(fakePrisma.job.rows[0].actualEnd).toBeInstanceOf(Date);

        expect(fakePrisma.timeEntry.rows).toHaveLength(2);
        expect(fakePrisma.timeEntry.rows.find((e: any) => e.id === 'te_job').endTime).toBeTruthy();
        expect(fakePrisma.timeEntry.rows.find((e: any) => e.id === 'te_other').endTime).toBeNull();

        expect(notifyCustomer).not.toHaveBeenCalled();
        expect(jobSummaryService.generateAndSend).not.toHaveBeenCalled();
        expect(fakePrisma.jobTimelineEvent.rows.some((e: any) => /completed by office/.test(e.message) && /phone/.test(e.message))).toBe(true);
        const audit = fakePrisma.auditLog.rows.find((a: any) => a.action === 'JOB_COMPLETED_BY_OFFICE');
        expect(audit?.metadata).toMatchObject({ previousStatus: 'ON_SITE', note: 'Customer confirmed by phone' });
    });

    it('skips the signature gate and works with no body', async () => {
        seedJob({ status: 'ASSIGNED', signatures: [] });
        const res = await request(app).post('/jobs/job_1/complete').set('Authorization', asDispatcher());
        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].status).toBe('COMPLETED');
        expect(fakePrisma.timeEntry.rows).toHaveLength(0);
    });

    it.each(['CANCELED', 'COMPLETED'])('409s a job that is already %s', async (status) => {
        seedJob({ status });
        const res = await request(app).post('/jobs/job_1/complete').set('Authorization', asOffice()).send({});
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows[0].status).toBe(status);
    });

    it('is forbidden for a technician', async () => {
        seedJob({ status: 'ON_SITE' });
        const res = await request(app).post('/jobs/job_1/complete').set('Authorization', asTech()).send({});
        expect(res.status).toBe(403);
        expect(fakePrisma.job.rows[0].status).toBe('ON_SITE');
    });

    it("404s another company's job", async () => {
        seedJob({ companyId: OTHER, status: 'ON_SITE' });
        const res = await request(app).post('/jobs/job_1/complete').set('Authorization', asOffice()).send({});
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows[0].status).toBe('ON_SITE');
    });
});

// ---------------------------------------------------------------------------
// 3. CANCELED cannot go through the status endpoint
// ---------------------------------------------------------------------------

describe('PATCH /jobs/:id/status with CANCELED', () => {
    it.each([
        ['office', asOffice],
        ['technician', asTech],
    ])('is a 400 pointing at /cancel for the %s', async (_label, auth) => {
        seedJob({ status: 'ON_SITE' });
        const res = await setStatus('job_1', 'CANCELED', auth());
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/\/cancel/);
        expect(fakePrisma.job.rows[0].status).toBe('ON_SITE');
    });
});

// ---------------------------------------------------------------------------
// 4. Line items lock once a non-draft invoice exists
// ---------------------------------------------------------------------------

describe('line-item lock after invoicing', () => {
    const item = { name: 'Geyser element', quantity: 1, unitPrice: 450, type: 'MATERIAL' };

    it('409s adding a line item when the invoice has been sent', async () => {
        seedJob({ status: 'COMPLETED' });
        fakePrisma.invoice.seed([{ id: 'inv_1', jobId: 'job_1', companyId: COMPANY, status: 'SENT' }]);
        const res = await request(app).post('/jobs/job_1/line-items').set('Authorization', asOffice()).send(item);
        expect(res.status).toBe(409);
        expect(fakePrisma.jobLineItem.rows).toHaveLength(0);
    });

    it('409s removing a line item when the invoice is paid', async () => {
        seedJob({ status: 'COMPLETED' });
        fakePrisma.jobLineItem.seed([{ id: 'li_1', jobId: 'job_1', name: 'Labour', quantity: 1, unitPrice: 500, total: 500, type: 'LABOR' }]);
        fakePrisma.invoice.seed([{ id: 'inv_1', jobId: 'job_1', companyId: COMPANY, status: 'PAID' }]);
        const res = await request(app).delete('/jobs/job_1/line-items/li_1').set('Authorization', asOffice());
        expect(res.status).toBe(409);
        expect(fakePrisma.jobLineItem.rows).toHaveLength(1);
    });

    it('also locks the technician out (same 409)', async () => {
        seedJob({ status: 'ON_SITE' });
        fakePrisma.invoice.seed([{ id: 'inv_1', jobId: 'job_1', companyId: COMPANY, status: 'SENT' }]);
        const res = await request(app).post('/jobs/job_1/line-items').set('Authorization', asTech()).send(item);
        expect(res.status).toBe(409);
    });

    it('keeps a DRAFT invoice job editable', async () => {
        seedJob({ status: 'COMPLETED' });
        fakePrisma.invoice.seed([{ id: 'inv_1', jobId: 'job_1', companyId: COMPANY, status: 'DRAFT' }]);
        const res = await request(app).post('/jobs/job_1/line-items').set('Authorization', asOffice()).send(item);
        expect(res.status).toBe(201);
        expect(fakePrisma.jobLineItem.rows).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 5–7. Create / quick create: tenancy, default end time, booking notification
// ---------------------------------------------------------------------------

describe('job create tenancy, default end and notifications', () => {
    const START = '2026-12-01T08:00:00.000Z';

    beforeEach(() => {
        fakePrisma.customer.seed([
            { id: CUSTOMER_ID, companyId: COMPANY, name: 'Mthembu Residence' },
            { id: FOREIGN_CUSTOMER_ID, companyId: OTHER, name: 'Not yours' },
        ]);
        fakePrisma.property.seed([
            { id: PROPERTY_ID, companyId: COMPANY, customerId: CUSTOMER_ID, addressLine1: '12 Vilakazi St', city: 'Soweto' },
        ]);
        fakePrisma.user.seed([{ id: TECH, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 'tech@example.com', firstName: 'Sipho' }]);
        fakePrisma.van.seed([{ id: FOREIGN_VAN_ID, companyId: OTHER, name: 'Their van', active: true }]);
        fakePrisma.project.seed([{ id: FOREIGN_PROJECT_ID, companyId: OTHER, name: 'Their project' }]);
    });

    const quick = (body: Record<string, unknown>) =>
        request(app).post('/jobs/quick').set('Authorization', asOffice()).send({
            customerName: 'Mthembu Residence', title: 'Leaking tap', ...body,
        });

    it("404s quick create with another company's existingCustomerId and creates nothing", async () => {
        const res = await quick({ existingCustomerId: FOREIGN_CUSTOMER_ID, addressLine1: '1 Main Rd', city: 'Durban' });
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows).toHaveLength(0);
        expect(fakePrisma.property.rows).toHaveLength(1);
    });

    it('404s quick create with a deleted customer', async () => {
        fakePrisma.customer.rows[0].deletedAt = new Date();
        const res = await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID });
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it("404s quick create with another company's project", async () => {
        const res = await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID, projectId: FOREIGN_PROJECT_ID });
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it("404s full create with another company's van", async () => {
        const res = await request(app).post('/jobs').set('Authorization', asOffice()).send({
            customerId: CUSTOMER_ID, propertyId: PROPERTY_ID, title: 'Geyser', vanId: FOREIGN_VAN_ID,
        });
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it("404s moving a job onto another company's van", async () => {
        seedJob({ status: 'ASSIGNED' });
        const res = await request(app).patch('/jobs/job_1').set('Authorization', asOffice()).send({ vanId: FOREIGN_VAN_ID });
        expect(res.status).toBe(404);
        expect(fakePrisma.job.rows[0].vanId).toBeNull();
    });

    it('defaults the end to start + 60 min on full create', async () => {
        const res = await request(app).post('/jobs').set('Authorization', asOffice()).send({
            customerId: CUSTOMER_ID, propertyId: PROPERTY_ID, title: 'Geyser', scheduledStart: START,
        });
        expect(res.status).toBe(201);
        expect(new Date(fakePrisma.job.rows[0].scheduledEnd).toISOString()).toBe('2026-12-01T09:00:00.000Z');
    });

    it('defaults the end to start + 60 min on quick create', async () => {
        const res = await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID, scheduledStart: START });
        expect(res.status).toBe(201);
        expect(new Date(fakePrisma.job.rows[0].scheduledEnd).toISOString()).toBe('2026-12-01T09:00:00.000Z');
    });

    it("uses the template's duration on quick create when it has one", async () => {
        (fakePrisma as any).jobTemplate.seed([{ id: TEMPLATE_ID, companyId: COMPANY, name: 'Geyser swap', defaultDurationMin: 150 }]);
        const res = await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID, scheduledStart: START, templateId: TEMPLATE_ID });
        expect(res.status).toBe(201);
        expect(new Date(fakePrisma.job.rows[0].scheduledEnd).toISOString()).toBe('2026-12-01T10:30:00.000Z');
    });

    it('keeps an explicit end and leaves an unscheduled job without times', async () => {
        await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID, scheduledStart: START, scheduledEnd: '2026-12-01T12:00:00.000Z' });
        await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID });
        expect(new Date(fakePrisma.job.rows[0].scheduledEnd).toISOString()).toBe('2026-12-01T12:00:00.000Z');
        expect(fakePrisma.job.rows[1].scheduledStart).toBeNull();
        expect(fakePrisma.job.rows[1].scheduledEnd).toBeNull();
    });

    it('sends the same booking confirmation as full create', async () => {
        const res = await quick({ existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID, techId: TECH, scheduledStart: START });
        expect(res.status).toBe(201);
        expect(notifyCustomer).toHaveBeenCalledWith(CUSTOMER_ID, COMPANY, 'APPOINTMENT_REMINDER', expect.objectContaining({ event: 'JOB_BOOKED', when: expect.any(String) }));
        expect(notificationService.notifyUser).toHaveBeenCalledWith(TECH, COMPANY, 'JOB_ASSIGNED', expect.any(String), expect.any(String));
    });
});

// ---------------------------------------------------------------------------
// Review follow-ups: arrival message once per day, conflicts, reschedule effects
// ---------------------------------------------------------------------------

describe('arrival message after a pause', () => {
    it('PAUSED → EN_ROUTE → ON_SITE the same day does not re-send "arrived"', async () => {
        seedJob({ status: 'ASSIGNED' });
        await setStatus('job_1', 'ON_SITE');
        await setStatus('job_1', 'PAUSED');
        notifyCustomer.mockClear();

        await setStatus('job_1', 'EN_ROUTE');
        await setStatus('job_1', 'ON_SITE');

        expect(customerMessageTypes()).toContain('JOB_EN_ROUTE');
        expect(customerMessageTypes()).not.toContain('JOB_STARTED');
    });

    it('coming back on a later day is a new arrival', async () => {
        seedJob({ status: 'PAUSED', arrivedNotifiedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
        await setStatus('job_1', 'ON_SITE');
        expect(customerMessageTypes()).toContain('JOB_STARTED');
    });
});

describe('booking conflicts and reschedule side effects', () => {
    const START = '2026-12-01T08:00:00.000Z';

    beforeEach(() => {
        fakePrisma.customer.seed([{ id: CUSTOMER_ID, companyId: COMPANY, name: 'Mthembu Residence' }]);
        fakePrisma.property.seed([{ id: PROPERTY_ID, companyId: COMPANY, customerId: CUSTOMER_ID, addressLine1: '12 Vilakazi St', city: 'Soweto' }]);
        fakePrisma.user.seed([{ id: TECH, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 'tech@example.com' }]);
    });

    const clash = () => fakePrisma.job.seed([{
        id: 'job_busy', companyId: COMPANY, techId: TECH, vanId: null, status: 'ASSIGNED', title: 'Already booked',
        scheduledStart: new Date('2026-12-01T08:30:00.000Z'), scheduledEnd: new Date('2026-12-01T09:30:00.000Z'),
    }]);

    it('409s a full create that double-books the tech', async () => {
        clash();
        const res = await request(app).post('/jobs').set('Authorization', asOffice()).send({
            customerId: CUSTOMER_ID, propertyId: PROPERTY_ID, title: 'Geyser', techId: TECH, scheduledStart: START,
        });
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('409s a quick create that double-books the tech', async () => {
        clash();
        const res = await request(app).post('/jobs/quick').set('Authorization', asOffice()).send({
            customerName: 'Mthembu Residence', title: 'Tap', existingCustomerId: CUSTOMER_ID,
            existingPropertyId: PROPERTY_ID, techId: TECH, scheduledStart: START,
        });
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('resets appointment reminders when the start moves', async () => {
        seedJob({
            status: 'ASSIGNED', scheduledStart: new Date(START), scheduledEnd: new Date('2026-12-01T09:00:00.000Z'),
            reminder24hSentAt: new Date(), reminder1hSentAt: new Date(),
        });
        const res = await request(app).patch('/jobs/job_1').set('Authorization', asOffice())
            .send({ scheduledStart: '2026-12-02T08:00:00.000Z', scheduledEnd: '2026-12-02T09:00:00.000Z' });
        expect(res.status).toBe(200);
        expect(fakePrisma.job.rows[0].reminder24hSentAt).toBeNull();
        expect(fakePrisma.job.rows[0].reminder1hSentAt).toBeNull();
    });

    it('tells both techs on a tech-to-tech reassign', async () => {
        const NEW_TECH = '77777777-7777-4777-8777-777777777777';
        fakePrisma.user.seed([{ id: NEW_TECH, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 'new@example.com' }]);
        seedJob({ status: 'ASSIGNED' });
        const res = await request(app).patch('/jobs/job_1').set('Authorization', asOffice()).send({ techId: NEW_TECH });
        expect(res.status).toBe(200);
        const notifyUser = vi.mocked(notificationService.notifyUser);
        expect(notifyUser).toHaveBeenCalledWith(NEW_TECH, COMPANY, 'JOB_ASSIGNED', expect.any(String), expect.any(String));
        expect(notifyUser).toHaveBeenCalledWith(TECH, COMPANY, 'ALERT', 'Job reassigned', expect.any(String));
    });
});
