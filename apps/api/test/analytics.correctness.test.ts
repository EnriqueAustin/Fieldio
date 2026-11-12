import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Swap in the in-memory fake before any router/service is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';
const office = () => authHeader({ role: 'OFFICE', companyId: COMPANY });

beforeEach(() => {
    fakePrisma.$reset();
});

describe('GET /analytics/dashboard — revenue correctness', () => {
    it('excludes DRAFT and VOID and sums the ex-VAT subtotal', async () => {
        const now = new Date();
        fakePrisma.invoice.seed([
            { id: 'd', companyId: COMPANY, jobId: 'jd', status: 'DRAFT', subtotal: 1000, tax: 150, total: 1150, balance: 1150, createdAt: now },
            { id: 'v', companyId: COMPANY, jobId: 'jv', status: 'VOID', subtotal: 2000, tax: 300, total: 2300, balance: 0, createdAt: now },
            { id: 's', companyId: COMPANY, jobId: 'js', status: 'SENT', subtotal: 500, tax: 75, total: 575, balance: 575, createdAt: now },
            { id: 'p', companyId: COMPANY, jobId: 'jp', status: 'PAID', subtotal: 300, tax: 45, total: 345, balance: 0, createdAt: now },
        ]);

        const res = await request(app).get('/analytics/dashboard').set('Authorization', office());

        expect(res.status).toBe(200);
        const stats = res.body.data.stats;
        // ex-VAT subtotal of SENT + PAID only: 500 + 300.
        expect(stats.revenue.total).toBe(800);
        expect(stats.revenue.label).toBe('Revenue (ex VAT)');
        // Outstanding = open balances only (SENT); DRAFT/VOID excluded.
        expect(stats.revenue.outstanding).toBe(575);
    });

    it('sums every estimate group for the close rate (never reads >100%)', async () => {
        const now = new Date();
        // Three different statuses in the sent-set → denominator must be 3, not 1.
        fakePrisma.estimate.seed([
            { id: 'e1', companyId: COMPANY, status: 'SENT', total: 100, createdAt: now },
            { id: 'e2', companyId: COMPANY, status: 'DECLINED', total: 100, createdAt: now },
            { id: 'e3', companyId: COMPANY, status: 'APPROVED', total: 100, createdAt: now },
        ]);

        const res = await request(app).get('/analytics/dashboard').set('Authorization', office());

        expect(res.status).toBe(200);
        expect(res.body.data.stats.estimates.sent).toBe(3);
        expect(res.body.data.stats.estimates.approved).toBe(1);
        expect(res.body.data.stats.estimates.conversionRate).toBe(33);
        expect(res.body.data.stats.estimates.conversionRate).toBeLessThanOrEqual(100);
    });

    it('excludes CANCELED jobs from the active count', async () => {
        const now = new Date();
        fakePrisma.job.seed([
            { id: 'j1', companyId: COMPANY, status: 'ASSIGNED', createdAt: now },
            { id: 'j2', companyId: COMPANY, status: 'COMPLETED', createdAt: now },
            { id: 'j3', companyId: COMPANY, status: 'CANCELED', createdAt: now },
        ]);

        const res = await request(app).get('/analytics/dashboard').set('Authorization', office());

        expect(res.status).toBe(200);
        const jobs = res.body.data.stats.jobs;
        expect(jobs.total).toBe(3);
        expect(jobs.completed).toBe(1);
        expect(jobs.canceled).toBe(1);
        expect(jobs.active).toBe(1); // only the ASSIGNED job
    });
});

describe('GET /analytics/job-costing — range + ex-VAT revenue', () => {
    it('honours the from/to range and uses the invoice subtotal', async () => {
        fakePrisma.job.seed([
            {
                id: 'ja',
                companyId: COMPANY,
                title: 'In range',
                status: 'COMPLETED',
                actualStart: new Date('2026-11-05T08:00:00Z'),
                actualEnd: new Date('2026-11-05T10:00:00Z'),
                customer: { name: 'Acme' },
                invoice: { subtotal: 1000, total: 1150, balance: 0, status: 'PAID' },
                expenses: [],
                purchaseOrders: [],
                tech: null,
            },
            {
                id: 'jb',
                companyId: COMPANY,
                title: 'Out of range',
                status: 'COMPLETED',
                actualStart: new Date('2026-10-01T08:00:00Z'),
                actualEnd: new Date('2026-10-01T10:00:00Z'),
                customer: { name: 'Beta' },
                invoice: { subtotal: 2000, total: 2300, balance: 0, status: 'PAID' },
                expenses: [],
                purchaseOrders: [],
                tech: null,
            },
        ]);

        const res = await request(app)
            .get('/analytics/job-costing')
            .query({ from: '2026-11-01', to: '2026-11-10' })
            .set('Authorization', office());

        expect(res.status).toBe(200);
        const report = res.body.data.report;
        expect(report.jobs).toHaveLength(1);
        expect(report.jobs[0].jobId).toBe('ja');
        // Revenue is ex-VAT subtotal (1000), not the gross 1150.
        expect(report.jobs[0].invoiceTotal).toBe(1000);
        expect(report.summary.totalRevenue).toBe(1000);
        expect(report.summary.revenueBasis).toBe('ex_vat_subtotal');
    });

    it('rejects an inverted range with 400', async () => {
        const res = await request(app)
            .get('/analytics/job-costing')
            .query({ from: '2026-11-10', to: '2026-11-01' })
            .set('Authorization', office());
        expect(res.status).toBe(400);
    });
});

describe('GET /analytics/kpi — one snapshot per company per day', () => {
    it('upserts rather than inserting on every read', async () => {
        fakePrisma.invoice.seed([
            { id: 's', companyId: COMPANY, jobId: 'js', status: 'SENT', subtotal: 500, tax: 75, total: 575, balance: 575, createdAt: new Date() },
        ]);

        const r1 = await request(app).get('/analytics/kpi').set('Authorization', office());
        const r2 = await request(app).get('/analytics/kpi').set('Authorization', office());

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        // Two reads, still a single snapshot row for today.
        expect(fakePrisma.kpiSnapshot.rows).toHaveLength(1);
        // Revenue reported ex-VAT (subtotal).
        expect(r2.body.data.snapshot.revenue).toBe(500);
    });
});

describe('DELETE /finance/invoices/:id is gone', () => {
    it('returns 404 — void is the only legal path', async () => {
        fakePrisma.invoice.seed([
            { id: 'inv_1', companyId: COMPANY, jobId: 'j1', status: 'SENT', subtotal: 100, tax: 15, total: 115, balance: 115 },
        ]);
        const res = await request(app)
            .delete('/finance/invoices/inv_1')
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }));
        expect(res.status).toBe(404);
    });
});
