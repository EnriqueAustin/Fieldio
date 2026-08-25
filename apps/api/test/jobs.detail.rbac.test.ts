import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';

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

// A job carrying every priced relation the detail endpoint can include, so the
// assertions below prove each one is stripped rather than merely absent.
function seed(overrides: Record<string, any> = {}) {
    fakePrisma.job.seed([
        {
            id: 'job_1',
            companyId: COMPANY,
            techId: TECH,
            vanId: null,
            customerId: 'cust_1',
            propertyId: 'prop_1',
            status: 'ON_SITE',
            title: 'Geyser callout',
            lineItems: [
                { id: 'li_1', name: 'Element', quantity: 1, unitPrice: 777, total: 777, type: 'MATERIAL' },
            ],
            expenses: [{ id: 'exp_1', description: 'Parking', amount: 40 }],
            invoice: { id: 'inv_1', total: 1234, subtotal: 1073, createdAt: new Date('2026-08-01T08:00:00.000Z') },
            estimate: { id: 'est_1', total: 4321 },
            purchaseOrders: [
                {
                    id: 'po_1',
                    orderNumber: 'PO-1',
                    status: 'RECEIVED',
                    subtotal: 3300,
                    total: 3795,
                    items: [{ name: 'Copper pipe', qty: 4, unitPrice: 85, total: 340 }],
                    supplier: { name: 'PlumbCo' },
                },
            ],
            checklist: [],
            photos: [],
            signatures: [],
            ...overrides,
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /jobs/:id as a TECHNICIAN', () => {
    it('returns the job assigned to them', async () => {
        const res = await request(app)
            .get('/jobs/job_1')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        expect(res.body.data.job.title).toBe('Geyser callout');
    });

    it('refuses a job assigned to somebody else', async () => {
        fakePrisma.$reset();
        seed({ techId: 'other_tech' });

        const res = await request(app)
            .get('/jobs/job_1')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(403);
    });

    it('strips every priced field from the response', async () => {
        const res = await request(app)
            .get('/jobs/job_1')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        const job = res.body.data.job;

        // Line items keep the what and how many, never the money.
        expect(job.lineItems[0].name).toBe('Element');
        expect(job.lineItems[0].quantity).toBe(1);
        expect(job.lineItems[0].unitPrice).toBeUndefined();
        expect(job.lineItems[0].total).toBeUndefined();

        // Priced relations are dropped; the invoice becomes a bare timestamp.
        expect(job.invoice).toBeUndefined();
        expect(job.estimate).toBeUndefined();
        expect(job.expenses).toBeUndefined();
        expect(job.costSummary).toBeUndefined();
        expect(job.invoicedAt).toBe('2026-08-01T08:00:00.000Z');

        // Supplier orders keep what was ordered, not what it cost.
        expect(job.purchaseOrders[0].orderNumber).toBe('PO-1');
        expect(job.purchaseOrders[0].items[0].name).toBe('Copper pipe');
        expect(job.purchaseOrders[0].items[0].unitPrice).toBeUndefined();
        expect(job.purchaseOrders[0].total).toBeUndefined();

        const body = JSON.stringify(res.body);
        for (const amount of ['777', '1234', '1073', '4321', '3300', '3795', '340']) {
            expect(body).not.toContain(amount);
        }
    });
});

describe('GET /jobs/:id as the office', () => {
    it('keeps pricing and the cost summary for OFFICE', async () => {
        const res = await request(app)
            .get('/jobs/job_1')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        const job = res.body.data.job;
        expect(job.lineItems[0].unitPrice).toBe(777);
        expect(job.invoice.total).toBe(1234);
        expect(job.costSummary).toBeDefined();
        expect(job.costSummary.totalRevenue).toBe(777);
    });
});
