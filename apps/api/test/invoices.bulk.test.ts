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

// Completed jobs with embedded relations (the fake returns rows as-is, so
// createFromJob reads lineItems/company/invoice from the embedded shape).
function seedJobs() {
    fakePrisma.job.seed([
        {
            id: 'job_a',
            companyId: COMPANY,
            customerId: 'cust_1',
            projectId: null,
            status: 'COMPLETED',
            lineItems: [{ id: 'li_1', name: 'Labor', quantity: 2, unitPrice: 100, total: 200, type: 'LABOR' }],
            company: { id: COMPANY, name: 'Acme Co', settings: {} },
            customer: { id: 'cust_1', name: 'Acme' },
            invoice: null,
        },
        {
            id: 'job_b',
            companyId: COMPANY,
            customerId: 'cust_2',
            projectId: null,
            status: 'COMPLETED',
            lineItems: [{ id: 'li_2', name: 'Geyser', quantity: 1, unitPrice: 4000, total: 4000, type: 'MATERIAL' }],
            company: { id: COMPANY, name: 'Acme Co', settings: {} },
            customer: { id: 'cust_2', name: 'Beta' },
            invoice: null,
        },
        // Already invoiced — must fail its row without sinking the batch.
        {
            id: 'job_c',
            companyId: COMPANY,
            customerId: 'cust_3',
            projectId: null,
            status: 'COMPLETED',
            lineItems: [{ id: 'li_3', name: 'Callout', quantity: 1, unitPrice: 350, total: 350, type: 'SERVICE' }],
            company: { id: COMPANY, name: 'Acme Co', settings: {} },
            customer: { id: 'cust_3', name: 'Gamma' },
            invoice: { id: 'inv_existing' },
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedJobs();
});

describe('POST /finance/invoices/bulk-generate', () => {
    it('creates an invoice per selected job', async () => {
        const res = await request(app)
            .post('/finance/invoices/bulk-generate')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ jobIds: ['job_a', 'job_b'] });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(2);
        expect(res.body.data.failed).toBe(0);
        expect(res.body.data.results.every((r: any) => r.ok && r.invoiceId)).toBe(true);

        const invA = await fakePrisma.invoice.findFirst({ where: { jobId: 'job_a' } });
        expect(invA).toBeTruthy();
        // 200 subtotal + 15% VAT = 230.
        expect(Number(invA.total)).toBe(230);
        expect(Number(invA.balance)).toBe(230);
        expect(invA.status).toBe('DRAFT');

        const invB = await fakePrisma.invoice.findFirst({ where: { jobId: 'job_b' } });
        expect(Number(invB.total)).toBe(4600);
    });

    it('reports per-job partial failure (already-invoiced and unknown jobs)', async () => {
        const res = await request(app)
            .post('/finance/invoices/bulk-generate')
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ jobIds: ['job_a', 'job_c', 'job_missing'] });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(1);
        expect(res.body.data.failed).toBe(2);

        const byJob = Object.fromEntries(res.body.data.results.map((r: any) => [r.jobId, r]));
        expect(byJob.job_a.ok).toBe(true);
        expect(byJob.job_c.ok).toBe(false);
        expect(byJob.job_c.error).toMatch(/already invoiced/i);
        expect(byJob.job_missing.ok).toBe(false);
        expect(byJob.job_missing.error).toMatch(/not found/i);
    });

    it('scopes to the caller company', async () => {
        const res = await request(app)
            .post('/finance/invoices/bulk-generate')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'other_co' }))
            .send({ jobIds: ['job_a'] });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(0);
        expect(res.body.data.results[0].error).toMatch(/not found/i);
    });

    it('rejects TECHNICIAN and unauthenticated callers', async () => {
        const denied = await request(app)
            .post('/finance/invoices/bulk-generate')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ jobIds: ['job_a'] });
        expect(denied.status).toBe(403);

        const anon = await request(app).post('/finance/invoices/bulk-generate').send({ jobIds: ['job_a'] });
        expect(anon.status).toBe(401);
    });

    it('validates the payload', async () => {
        const res = await request(app)
            .post('/finance/invoices/bulk-generate')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ jobIds: [] });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });
});
