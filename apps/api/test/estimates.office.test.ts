import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Swap the real database for the shared in-memory fake before routers import it.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';

function seed() {
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Acme', email: 'a@acme.test', phone: null },
    ]);
    fakePrisma.estimate.seed([
        { id: 'est_draft', companyId: COMPANY, customerId: 'cust_1', status: 'DRAFT', total: 500, sentAt: null },
        { id: 'est_sent', companyId: COMPANY, customerId: 'cust_1', status: 'SENT', total: 900, sentAt: new Date() },
        { id: 'est_approved', companyId: COMPANY, customerId: 'cust_1', status: 'APPROVED', total: 100 },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /finance/estimates (status filter)', () => {
    it('returns all estimates when no filter is given', async () => {
        const res = await request(app)
            .get('/finance/estimates')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.estimates).toHaveLength(3);
    });

    it('filters by status', async () => {
        const res = await request(app)
            .get('/finance/estimates?status=SENT')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.estimates).toHaveLength(1);
        expect(res.body.data.estimates[0].id).toBe('est_sent');
    });
});

describe('POST /finance/estimates/:id/send', () => {
    it('marks a DRAFT estimate SENT and returns the payload', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_draft/send')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.estimate.status).toBe('SENT');

        const stored = await fakePrisma.estimate.findFirst({ where: { id: 'est_draft' } });
        expect(stored.status).toBe('SENT');
        expect(stored.sentAt).toBeTruthy();
    });

    it('rejects sending an already-approved estimate', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_approved/send')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(400);
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_draft/send')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});

describe('POST /finance/estimates/:id/decline', () => {
    it('marks an estimate DECLINED', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_sent/decline')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.estimate.status).toBe('DECLINED');
        expect(res.body.data.estimate.declinedAt).toBeTruthy();
    });

    it('cannot decline an approved estimate', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_approved/decline')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(400);
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_sent/decline')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});

describe('GET /finance/invoices/uninvoiced-jobs', () => {
    beforeEach(() => {
        fakePrisma.job.seed([
            { id: 'job_done', companyId: COMPANY, customerId: 'cust_1', status: 'COMPLETED', lineItems: [{ total: 300 }] },
        ]);
    });

    it('lists completed jobs for OFFICE', async () => {
        const res = await request(app)
            .get('/finance/invoices/uninvoiced-jobs')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data.jobs)).toBe(true);
        expect(res.body.data.jobs.find((j: any) => j.id === 'job_done')).toBeTruthy();
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .get('/finance/invoices/uninvoiced-jobs')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});
