import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

// Replace the real database with the shared in-memory fake before any router
// (and its service layer) is imported.
import { vi } from 'vitest';
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';
const TECH = 'user_test'; // matches authHeader default userId

// Seed a completed, assigned job with embedded relations. The fake Prisma returns
// rows as-is (includes are not modelled), so createFromJob reads lineItems/company
// from the embedded shape. No company row is seeded, so notifyCustomer short-circuits
// and no real email/SMS is attempted.
function seedJob(overrides: Record<string, any> = {}) {
    fakePrisma.job.seed([
        {
            id: 'job_1',
            companyId: COMPANY,
            techId: TECH,
            vanId: null,
            customerId: 'cust_1',
            projectId: null,
            status: 'COMPLETED',
            lineItems: [
                { id: 'li_1', name: 'Labor', quantity: 2, unitPrice: 150, total: 300, type: 'LABOR' },
                { id: 'li_2', name: 'Pipe', quantity: 1, unitPrice: 40, total: 40, type: 'MATERIAL' },
            ],
            company: { id: COMPANY, name: 'Acme Co', settings: {} },
            customer: { id: 'cust_1', name: 'Acme', email: 'jane@acme.test', phone: '+27821234567' },
            invoice: null,
            ...overrides,
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedJob();
});

describe('POST /finance/jobs/:jobId/field-invoice', () => {
    it('lets an assigned TECHNICIAN invoice the job and send a pay link', async () => {
        const res = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.data.sent).toBe(true);
        expect(res.body.data.alreadyInvoiced).toBe(false);
        // A masked "sent to" indicator is surfaced, never the raw contact.
        expect(res.body.data.sentTo).toBe('j***@acme.test');

        // The invoice was actually created for the job.
        const inv = await fakePrisma.invoice.findFirst({ where: { jobId: 'job_1' } });
        expect(inv).toBeTruthy();
        expect(inv.status).toBe('SENT');
    });

    it('returns NO amounts to a TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('invoice');

        // Belt-and-braces: no monetary fields anywhere in the serialized body.
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/"total"/);
        expect(body).not.toMatch(/subtotal/i);
        expect(body).not.toMatch(/balance/i);
        expect(body).not.toMatch(/unitPrice/i);
    });

    it('returns the invoice (with amounts) to OFFICE', async () => {
        const res = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.data.invoice).toBeTruthy();
        // 300 + 40 = 340 subtotal, +15% VAT = 391 total.
        expect(res.body.data.invoice.total).toBe(391);
    });

    it('rejects a TECHNICIAN who is not assigned to the job', async () => {
        fakePrisma.$reset();
        seedJob({ techId: 'someone_else' });

        const res = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/assigned/i);
    });

    it('is idempotent: a second call resends the link instead of duplicating', async () => {
        const first = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});
        expect(first.status).toBe(200);
        expect(first.body.data.alreadyInvoiced).toBe(false);

        const second = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});
        expect(second.status).toBe(200);
        expect(second.body.data.alreadyInvoiced).toBe(true);

        // Still exactly one invoice for the job.
        const invoices = await fakePrisma.invoice.findMany({ where: { jobId: 'job_1' } });
        expect(invoices).toHaveLength(1);
    });

    it('404s for a job in another company', async () => {
        const res = await request(app)
            .post('/finance/jobs/job_1/field-invoice')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH, companyId: 'other_co' }))
            .send({});

        expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
        const res = await request(app).post('/finance/jobs/job_1/field-invoice').send({});
        expect(res.status).toBe(401);
    });
});
