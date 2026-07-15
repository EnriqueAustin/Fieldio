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
const now = new Date();

function seed() {
    fakePrisma.invoice.seed([
        { id: 'inv_1', companyId: COMPANY, total: 1000, status: 'PAID', createdAt: now },
        { id: 'inv_2', companyId: COMPANY, total: 500, status: 'SENT', createdAt: now },
        // DRAFT invoices are excluded from revenue.
        { id: 'inv_draft', companyId: COMPANY, total: 999, status: 'DRAFT', createdAt: now },
    ]);
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, status: 'COMPLETED', createdAt: now },
        { id: 'job_2', companyId: COMPANY, status: 'ASSIGNED', createdAt: now },
    ]);
    fakePrisma.estimate.seed([
        { id: 'est_sent', companyId: COMPANY, status: 'SENT', total: 800, jobId: null, createdAt: now },
        { id: 'est_appr', companyId: COMPANY, status: 'APPROVED', total: 1200, jobId: 'job_x', createdAt: now },
        { id: 'est_decl', companyId: COMPANY, status: 'DECLINED', total: 300, jobId: null, createdAt: now },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /analytics/timeseries', () => {
    it('returns weekly buckets, revenue and a quote funnel for ADMIN', async () => {
        const res = await request(app)
            .get('/analytics/timeseries?days=30')
            .set('Authorization', authHeader({ role: 'ADMIN' }));

        expect(res.status).toBe(200);
        const report = res.body.data.report;
        expect(Array.isArray(report.weeks)).toBe(true);

        // Only non-draft invoices count towards revenue (1000 + 500).
        const totalRevenue = report.weeks.reduce((s: number, w: any) => s + w.revenue, 0);
        expect(totalRevenue).toBe(1500);

        // Jobs-by-status totals across weeks.
        const completed = report.weeks.reduce((s: number, w: any) => s + (w.jobsByStatus.COMPLETED ?? 0), 0);
        expect(completed).toBe(1);

        // Funnel: sent counts SENT+APPROVED+DECLINED = 3; approved 1; converted (approved w/ jobId) 1.
        expect(report.funnel.sent.count).toBe(3);
        expect(report.funnel.approved.count).toBe(1);
        expect(report.funnel.converted.count).toBe(1);
        expect(report.funnel.approved.value).toBe(1200);
    });

    it('is allowed for OFFICE and ACCOUNTANT', async () => {
        for (const role of ['OFFICE', 'ACCOUNTANT'] as const) {
            const res = await request(app)
                .get('/analytics/timeseries?days=7')
                .set('Authorization', authHeader({ role }));
            expect(res.status).toBe(200);
        }
    });

    it('is forbidden for TECHNICIAN and SALES', async () => {
        for (const role of ['TECHNICIAN', 'SALES'] as const) {
            const res = await request(app)
                .get('/analytics/timeseries?days=7')
                .set('Authorization', authHeader({ role }));
            expect(res.status).toBe(403);
        }
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/analytics/timeseries?days=7');
        expect(res.status).toBe(401);
    });
});
