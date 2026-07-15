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
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

function seed() {
    fakePrisma.user.seed([
        { id: 'tech_a', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', firstName: 'Sipho', lastName: 'Mthembu', email: 'sipho@test.io' },
        { id: 'tech_b', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', firstName: null, lastName: null, email: 'thandi@test.io' },
        // Inactive tech must not appear on the scoreboard.
        { id: 'tech_gone', companyId: COMPANY, role: 'TECHNICIAN', status: 'INACTIVE', email: 'gone@test.io' },
    ]);
    fakePrisma.job.seed([
        {
            id: 'job_a1', companyId: COMPANY, techId: 'tech_a', status: 'COMPLETED',
            actualStart: hoursAgo(4), actualEnd: hoursAgo(2),
            invoice: { total: 1500 },
        },
        {
            id: 'job_a2', companyId: COMPANY, techId: 'tech_a', status: 'COMPLETED',
            actualStart: hoursAgo(30), actualEnd: hoursAgo(26),
            invoice: { total: 500 },
        },
        {
            id: 'job_b1', companyId: COMPANY, techId: 'tech_b', status: 'COMPLETED',
            actualStart: hoursAgo(8), actualEnd: hoursAgo(7),
            invoice: { total: 900 },
        },
    ]);
    // A warranty claim against job_a2 breaks tech_a's first-time-fix on that job.
    fakePrisma.warrantyClaim.seed([
        { id: 'wc_1', companyId: COMPANY, jobId: 'job_a2' },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /analytics/scoreboard', () => {
    it('returns per-tech metrics for ADMIN', async () => {
        const res = await request(app)
            .get('/analytics/scoreboard?days=30')
            .set('Authorization', authHeader({ role: 'ADMIN' }));

        expect(res.status).toBe(200);
        const report = res.body.data.report;
        expect(report.scoreboard).toHaveLength(2); // inactive tech excluded

        const techA = report.scoreboard.find((r: any) => r.tech.id === 'tech_a');
        const techB = report.scoreboard.find((r: any) => r.tech.id === 'tech_b');

        expect(techA.tech.name).toBe('Sipho Mthembu');
        expect(techA.jobsCompleted).toBe(2);
        expect(techA.revenue).toBe(2000);
        expect(techA.avgDurationHours).toBe(3); // (2h + 4h) / 2
        expect(techA.firstTimeFixRate).toBe(50); // 1 of 2 jobs has a warranty claim

        expect(techB.tech.name).toBe('thandi@test.io'); // falls back to email
        expect(techB.jobsCompleted).toBe(1);
        expect(techB.revenue).toBe(900);
        expect(techB.firstTimeFixRate).toBe(100);

        // Revenue-sorted: tech_a first.
        expect(report.scoreboard[0].tech.id).toBe('tech_a');
        expect(report.totals.jobsCompleted).toBe(3);
        expect(report.totals.revenue).toBe(2900);
        expect(report.availableHours).toBeGreaterThan(0);
    });

    it('is allowed for ACCOUNTANT', async () => {
        const res = await request(app)
            .get('/analytics/scoreboard?days=30')
            .set('Authorization', authHeader({ role: 'ACCOUNTANT' }));
        expect(res.status).toBe(200);
    });

    it('is forbidden for OFFICE and TECHNICIAN', async () => {
        for (const role of ['OFFICE', 'TECHNICIAN'] as const) {
            const res = await request(app)
                .get('/analytics/scoreboard?days=30')
                .set('Authorization', authHeader({ role }));
            expect(res.status).toBe(403);
        }
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/analytics/scoreboard');
        expect(res.status).toBe(401);
    });
});

describe('GET /analytics/kpi (custom range + deltas)', () => {
    it('accepts from/to and returns extended change fields', async () => {
        fakePrisma.invoice.seed([
            { id: 'inv_kpi', companyId: COMPANY, total: 1000, status: 'PAID', createdAt: now },
        ]);
        const from = new Date(now.getTime() - 14 * 86_400_000).toISOString();
        const to = now.toISOString();
        const res = await request(app)
            .get(`/analytics/kpi?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
            .set('Authorization', authHeader({ role: 'ADMIN' }));

        expect(res.status).toBe(200);
        const snapshot = res.body.data.snapshot;
        expect(snapshot).toHaveProperty('revenueChange');
        expect(snapshot).toHaveProperty('avgTicketChange');
        expect(snapshot).toHaveProperty('closeRateChange');
        expect(snapshot).toHaveProperty('jobsCompletedChange');
        expect(snapshot.range).toBeTruthy();
    });
});
