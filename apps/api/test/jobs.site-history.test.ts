import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Replace the real database with the shared in-memory fake before any router
// (and its service layer) is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';

// The shared buildTestApp only mounts portal/payments/finance; mount the jobs
// router here on the same middleware chain used by the real server.
function buildJobsApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use(errorHandler);
    return app;
}

const app = buildJobsApp();
const COMPANY = 'company_1';
const TECH = 'user_test'; // matches authHeader default userId

// Seeds the current job plus two prior COMPLETED visits for the same customer.
// Pricing relations are intentionally embedded on the prior jobs to prove the
// endpoint never reads or returns them.
function seed(currentOverrides: Record<string, any> = {}) {
    fakePrisma.job.seed([
        {
            id: 'job_current',
            companyId: COMPANY,
            techId: TECH,
            vanId: null,
            customerId: 'cust_1',
            propertyId: 'prop_1',
            status: 'ON_SITE',
            title: 'Today geyser callout',
            ...currentOverrides,
        },
        {
            id: 'job_prev_1',
            companyId: COMPANY,
            techId: 'tech_bob',
            vanId: null,
            customerId: 'cust_1',
            propertyId: 'prop_1',
            status: 'COMPLETED',
            title: 'Geyser replacement',
            description: 'Swapped the 150L element',
            actualEnd: new Date('2026-05-01T10:00:00.000Z'),
            scheduledEnd: new Date('2026-05-01T09:00:00.000Z'),
            tech: { id: 'tech_bob', email: 'bob@acme.test', firstName: 'Bob', lastName: 'Ndlovu' },
            photos: [{ id: 'ph_1' }, { id: 'ph_2' }],
            // Pricing that must never surface for a tech:
            lineItems: [{ id: 'li_1', name: 'Element', quantity: 1, unitPrice: 999, total: 999, type: 'MATERIAL' }],
        },
        {
            id: 'job_prev_2',
            companyId: COMPANY,
            techId: 'tech_bob',
            vanId: null,
            customerId: 'cust_1',
            propertyId: 'prop_2',
            status: 'COMPLETED',
            title: 'Leak inspection',
            description: null,
            actualEnd: new Date('2026-03-01T10:00:00.000Z'),
            tech: { id: 'tech_bob', email: 'bob@acme.test', firstName: 'Bob', lastName: 'Ndlovu' },
            photos: [],
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /jobs/:id/site-history', () => {
    it('returns prior completed visits for an assigned TECHNICIAN', async () => {
        const res = await request(app)
            .get('/jobs/job_current/site-history')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        const history = res.body.data.history;
        expect(Array.isArray(history)).toBe(true);
        // Two prior COMPLETED jobs; the current (ON_SITE) job is excluded.
        expect(history).toHaveLength(2);

        const geyser = history.find((h: any) => h.id === 'job_prev_1');
        expect(geyser.title).toBe('Geyser replacement');
        expect(geyser.technicianName).toBe('Bob Ndlovu');
        expect(geyser.photoCount).toBe(2);
        expect(geyser.isSameProperty).toBe(true);

        const leak = history.find((h: any) => h.id === 'job_prev_2');
        expect(leak.isSameProperty).toBe(false); // prop_2 != prop_1
        expect(leak.photoCount).toBe(0);
    });

    it('returns NO pricing fields anywhere for a TECHNICIAN', async () => {
        const res = await request(app)
            .get('/jobs/job_current/site-history')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/unitPrice/i);
        expect(body).not.toMatch(/"total"/);
        expect(body).not.toMatch(/subtotal/i);
        expect(body).not.toMatch(/lineItems/i);
        expect(body).not.toMatch(/\bprice\b/i);
        expect(body).not.toMatch(/\bcost\b/i);
        // The pricey line-item value must not leak through.
        expect(body).not.toContain('999');
    });

    it('allows OFFICE to view history for any job in the company', async () => {
        const res = await request(app)
            .get('/jobs/job_current/site-history')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.body.data.history).toHaveLength(2);
    });

    it('rejects a TECHNICIAN who is not assigned to the job (403)', async () => {
        fakePrisma.$reset();
        seed({ techId: 'someone_else' });

        const res = await request(app)
            .get('/jobs/job_current/site-history')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/assigned/i);
    });

    it('404s for a job in another company', async () => {
        const res = await request(app)
            .get('/jobs/job_current/site-history')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH, companyId: 'other_co' }));

        expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/jobs/job_current/site-history');
        expect(res.status).toBe(401);
    });
});
