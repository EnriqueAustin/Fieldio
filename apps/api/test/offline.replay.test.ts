import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Offline replay hardening for the field console: an idempotency key dedupes a
// replayed field write, status taps carry their real (client) time, stale
// replays don't fire time-sensitive customer messages, a backwards status move
// is a no-op, completion is gated on signature + required forms, and the
// assigned feed is trimmed for the phone.

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});
vi.mock('../src/services/socket.service', () => ({
    socketService: { emitToCompany: vi.fn(), emitToUser: vi.fn() },
}));
const notifyCustomer = vi.fn(async () => {});
const notifyUser = vi.fn(async () => {});
vi.mock('../src/services/notifications/notification.service', () => ({
    notificationService: {
        notifyCustomer: (...args: unknown[]) => (notifyCustomer as any)(...args),
        notifyUser: (...args: unknown[]) => (notifyUser as any)(...args),
    },
}));
const generateAndSend = vi.fn(async () => ({ pdfUrl: 'https://files.test/x.pdf', bytes: 1 }));
vi.mock('../src/modules/jobs/summary-pdf.service', () => ({
    jobSummaryService: { generateAndSend: (...args: unknown[]) => (generateAndSend as any)(...args) },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH_ID = 'tech_1';
const tech = authHeader({ role: 'TECHNICIAN', userId: TECH_ID });

const KEY = '11111111-1111-1111-1111-111111111111';
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
    fakePrisma.$reset();
    notifyCustomer.mockClear();
    notifyUser.mockClear();
    generateAndSend.mockClear();
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings: {} }]);
    fakePrisma.customer.seed([{ id: 'cust_1', companyId: COMPANY, name: 'Acme' }]);
});

// --- 1. Idempotency replay -------------------------------------------------

describe('idempotency key', () => {
    beforeEach(() => {
        fakePrisma.job.seed([
            { id: 'job_li', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, vanId: null, title: 'Line items', checklist: [] },
        ]);
    });

    const addItem = (key: string, body: Record<string, unknown>) =>
        request(app).post('/jobs/job_li/line-items').set('Authorization', tech).set('Idempotency-Key', key).send(body);

    it('runs once and replays the stored response on a repeat', async () => {
        const body = { name: 'Valve', quantity: 2, unitPrice: 0, type: 'SERVICE' };
        const first = await addItem(KEY, body);
        expect(first.status).toBe(201);
        expect(first.headers['idempotent-replay']).toBeUndefined();

        const second = await addItem(KEY, body);
        expect(second.status).toBe(201);
        expect(second.headers['idempotent-replay']).toBe('true');
        expect(second.body).toEqual(first.body);

        const items = await fakePrisma.jobLineItem.findMany({ where: { jobId: 'job_li' } });
        expect(items).toHaveLength(1);
    });

    it('does not store a failed (4xx) attempt, so a retry can succeed', async () => {
        // name: '' fails the zod guard → 400, nothing created, nothing stored.
        const bad = await addItem(KEY, { name: '', quantity: 1, unitPrice: 0, type: 'SERVICE' });
        expect(bad.status).toBe(400);

        const stored = await fakePrisma.idempotencyKey.findFirst({ where: { companyId: COMPANY, userId: TECH_ID, key: KEY } });
        expect(stored).toBeNull();

        const good = await addItem(KEY, { name: 'Valve', quantity: 1, unitPrice: 0, type: 'SERVICE' });
        expect(good.status).toBe(201);
        expect(good.headers['idempotent-replay']).toBeUndefined();

        const items = await fakePrisma.jobLineItem.findMany({ where: { jobId: 'job_li' } });
        expect(items).toHaveLength(1);
    });

    it('handles two identical requests arriving together (one create)', async () => {
        const body = { name: 'Valve', quantity: 1, unitPrice: 0, type: 'SERVICE' };
        const [r1, r2] = await Promise.all([addItem(KEY, body), addItem(KEY, body)]);
        expect(r1.status).toBe(201);
        expect(r2.status).toBe(201);
        // Exactly one handler ran.
        const items = await fakePrisma.jobLineItem.findMany({ where: { jobId: 'job_li' } });
        expect(items).toHaveLength(1);
        // One of the pair is served from the stored response.
        expect([r1.headers['idempotent-replay'], r2.headers['idempotent-replay']]).toContain('true');
    });

    it('rejects a malformed idempotency key', async () => {
        const res = await addItem('short', { name: 'Valve', quantity: 1, unitPrice: 0, type: 'SERVICE' });
        expect(res.status).toBe(400);
    });

    it('passes through when no key is sent', async () => {
        const res = await request(app)
            .post('/jobs/job_li/line-items')
            .set('Authorization', tech)
            .send({ name: 'Valve', quantity: 1, unitPrice: 0, type: 'SERVICE' });
        expect(res.status).toBe(201);
        expect(res.headers['idempotent-replay']).toBeUndefined();
    });
});

// --- 2. clientAt tap time --------------------------------------------------

describe('status clock uses the tap time', () => {
    const patchStatus = (id: string, body: Record<string, unknown>) =>
        request(app).patch(`/jobs/${id}/status`).set('Authorization', tech).send(body);

    it('stamps actualStart with a clientAt inside the window', async () => {
        fakePrisma.job.seed([
            { id: 'job_c1', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Tap', status: 'ASSIGNED', checklist: [], actualStart: null, customer: { id: 'cust_1', name: 'Acme' } },
        ]);
        const clientAt = isoAgo(10 * 60 * 1000); // 10 min ago
        const res = await patchStatus('job_c1', { status: 'ON_SITE', clientAt });
        expect(res.status).toBe(200);
        const job = await fakePrisma.job.findFirst({ where: { id: 'job_c1' } });
        expect(new Date(job.actualStart).getTime()).toBe(new Date(clientAt).getTime());
    });

    it('stamps actualEnd with a clientAt inside the window on completion', async () => {
        fakePrisma.job.seed([
            { id: 'job_c2', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Done', status: 'ON_SITE', checklist: [], signatures: [{ id: 'sig1', signerName: 'Cust', signedAt: new Date() }], actualStart: new Date(Date.now() - 60 * 60 * 1000), customer: { id: 'cust_1', name: 'Acme' } },
        ]);
        const clientAt = isoAgo(5 * 60 * 1000); // 5 min ago
        const res = await patchStatus('job_c2', { status: 'COMPLETED', clientAt });
        expect(res.status).toBe(200);
        const job = await fakePrisma.job.findFirst({ where: { id: 'job_c2' } });
        expect(new Date(job.actualEnd).getTime()).toBe(new Date(clientAt).getTime());
    });

    it('ignores a clientAt older than 24h and falls back to server time', async () => {
        fakePrisma.job.seed([
            { id: 'job_c3', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Old', status: 'ASSIGNED', checklist: [], actualStart: null, customer: { id: 'cust_1', name: 'Acme' } },
        ]);
        const stale = isoAgo(48 * 60 * 60 * 1000); // 48h ago → outside window
        const res = await patchStatus('job_c3', { status: 'ON_SITE', clientAt: stale });
        expect(res.status).toBe(200);
        const job = await fakePrisma.job.findFirst({ where: { id: 'job_c3' } });
        expect(new Date(job.actualStart).getTime()).not.toBe(new Date(stale).getTime());
        // Within a few seconds of now (server time).
        expect(Math.abs(new Date(job.actualStart).getTime() - Date.now())).toBeLessThan(10_000);
    });
});

// --- 3. Stale replay customer messages -------------------------------------

describe('stale replays skip time-sensitive customer messages', () => {
    const patchStatus = (id: string, body: Record<string, unknown>) =>
        request(app).patch(`/jobs/${id}/status`).set('Authorization', tech).send(body);

    it('does not send JOB_EN_ROUTE for a stale (>15 min) replay but does for a fresh tap', async () => {
        fakePrisma.job.seed([
            { id: 'job_stale', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Stale', status: 'ASSIGNED', checklist: [], customer: { id: 'cust_1', name: 'Acme' } },
            { id: 'job_fresh', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Fresh', status: 'ASSIGNED', checklist: [], customer: { id: 'cust_1', name: 'Acme' } },
        ]);

        await patchStatus('job_stale', { status: 'EN_ROUTE', clientAt: isoAgo(30 * 60 * 1000) });
        expect(notifyCustomer).not.toHaveBeenCalled();

        await patchStatus('job_fresh', { status: 'EN_ROUTE' });
        expect(notifyCustomer).toHaveBeenCalledWith('cust_1', COMPANY, 'JOB_EN_ROUTE', expect.anything());
    });
});

// --- 4. Out-of-order guard -------------------------------------------------

describe('out-of-order status guard', () => {
    it('ignores ON_SITE after COMPLETED (no reopen, no clock restart)', async () => {
        const actualEnd = new Date(Date.now() - 30 * 60 * 1000);
        fakePrisma.job.seed([
            { id: 'job_oo', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Done', status: 'COMPLETED', checklist: [], actualEnd },
        ]);
        const res = await request(app)
            .patch('/jobs/job_oo/status')
            .set('Authorization', tech)
            .send({ status: 'ON_SITE', clientAt: isoAgo(5 * 60 * 1000) });
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('COMPLETED');

        const job = await fakePrisma.job.findFirst({ where: { id: 'job_oo' } });
        expect(job.status).toBe('COMPLETED');
        expect(new Date(job.actualEnd).getTime()).toBe(actualEnd.getTime());
        const entries = await fakePrisma.timeEntry.findMany({ where: { companyId: COMPANY } });
        expect(entries).toHaveLength(0);
    });
});

// --- 5. Completion enforcement ---------------------------------------------

describe('server-side completion gating', () => {
    const complete = (id: string) =>
        request(app).patch(`/jobs/${id}/status`).set('Authorization', tech).send({ status: 'COMPLETED' });

    it('rejects completion without a customer signature', async () => {
        fakePrisma.job.seed([
            { id: 'job_nosig', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'No sig', status: 'ON_SITE', checklist: [], signatures: [] },
        ]);
        const res = await complete('job_nosig');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/signature/i);
        const job = await fakePrisma.job.findFirst({ where: { id: 'job_nosig' } });
        expect(job.status).toBe('ON_SITE');
    });

    it('rejects completion while a required form is outstanding', async () => {
        fakePrisma.job.seed([
            { id: 'job_noform', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'No form', status: 'ON_SITE', checklist: [], signatures: [{ id: 'sig1', signerName: 'Cust', signedAt: new Date() }] },
        ]);
        fakePrisma.digitalFormTemplate.seed([
            { id: 'tpl_1', companyId: COMPANY, name: 'Compliance Cert', active: true, schema: { requiredForCompletion: true } },
        ]);
        const res = await complete('job_noform');
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Submit the required form: Compliance Cert');
    });

    it('allows completion once signature and required form are present', async () => {
        fakePrisma.job.seed([
            { id: 'job_ok', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Ok', status: 'ON_SITE', checklist: [], signatures: [{ id: 'sig1', signerName: 'Cust', signedAt: new Date() }], customer: { id: 'cust_1', name: 'Acme' } },
        ]);
        fakePrisma.digitalFormTemplate.seed([
            { id: 'tpl_1', companyId: COMPANY, name: 'Compliance Cert', active: true, schema: { requiredForCompletion: true } },
        ]);
        fakePrisma.digitalFormSubmission.seed([
            { id: 'sub_1', companyId: COMPANY, templateId: 'tpl_1', jobId: 'job_ok', userId: TECH_ID, data: {} },
        ]);
        const res = await complete('job_ok');
        expect(res.status).toBe(200);
        expect(res.body.data.job.status).toBe('COMPLETED');
    });
});

// --- 6. Assigned feed ------------------------------------------------------

describe('assigned feed for the phone', () => {
    it("includes today's completed job, excludes far-future work, and carries no prices or signature images", async () => {
        const today = new Date();
        const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        fakePrisma.job.seed([
            {
                id: 'job_open', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Open today',
                status: 'ASSIGNED', scheduledStart: today,
                customer: { id: 'cust_1', name: 'Acme', phone: '011', email: 'a@a.test' },
                checklist: [], photos: [], lineItems: [{ id: 'li1', name: 'Valve', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' }],
                signatures: [{ id: 'sig1', signerName: 'Cust', signedAt: today, signatureDataUrl: 'data:image/png;base64,SECRETIMAGE' }],
            },
            {
                id: 'job_done', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Done today',
                status: 'COMPLETED', actualEnd: today, scheduledStart: today,
                customer: { id: 'cust_1', name: 'Acme', phone: '011', email: 'a@a.test' },
                checklist: [], photos: [], lineItems: [],
                signatures: [{ id: 'sig2', signerName: 'Cust', signedAt: today, signatureDataUrl: 'data:image/png;base64,SECRETIMAGE' }],
            },
            {
                id: 'job_far', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, title: 'Far future',
                status: 'ASSIGNED', scheduledStart: far,
                customer: { id: 'cust_1', name: 'Acme' }, checklist: [], photos: [], lineItems: [], signatures: [],
            },
        ]);

        const res = await request(app).get('/jobs/assigned/me').set('Authorization', tech);
        expect(res.status).toBe(200);
        const jobs = res.body.data.jobs as any[];
        const ids = jobs.map((j) => j.id);
        expect(ids).toContain('job_open');
        expect(ids).toContain('job_done');
        expect(ids).not.toContain('job_far');

        const done = jobs.find((j) => j.id === 'job_done');
        expect(done.completedToday).toBe(true);
        const open = jobs.find((j) => j.id === 'job_open');
        expect(open.completedToday).toBe(false);

        const serialized = JSON.stringify(res.body);
        expect(serialized).not.toContain('SECRETIMAGE');
        expect(serialized).not.toContain('signatureDataUrl');
        // Prices stripped from line items.
        expect(open.lineItems[0].name).toBe('Valve');
        expect(open.lineItems[0].unitPrice).toBeUndefined();
        expect(open.lineItems[0].total).toBeUndefined();
        // Signature identity kept, image dropped.
        expect(open.signatures[0]).toEqual({ id: 'sig1', signerName: 'Cust', signedAt: expect.anything() });
    });
});
