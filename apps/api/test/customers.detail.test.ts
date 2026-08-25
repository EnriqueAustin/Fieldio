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
import { customerRouter } from '../src/routes/customers';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/customers', customerRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const CUSTOMER = 'cust_1';

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.customer.seed([
        {
            id: CUSTOMER,
            companyId: COMPANY,
            name: 'Braamfontein Body Corporate',
            properties: [],
            // Only the most recent page of jobs is embedded — the summary must
            // not be computed from it.
            jobs: [{ id: 'job_1', title: 'Recent job', status: 'COMPLETED' }],
            _count: { jobs: 12, properties: 2 },
        },
    ]);
    fakePrisma.invoice.seed([
        { id: 'inv_1', companyId: COMPANY, status: 'PAID', total: 1518, balance: 0 },
        { id: 'inv_2', companyId: COMPANY, status: 'OVERDUE', total: 2300, balance: 2300 },
        { id: 'inv_3', companyId: COMPANY, status: 'PARTIAL', total: 1000, balance: 400 },
        { id: 'inv_4', companyId: COMPANY, status: 'VOID', total: 9999, balance: 9999 },
    ]);
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, customerId: CUSTOMER, status: 'COMPLETED' },
        { id: 'job_2', companyId: COMPANY, customerId: CUSTOMER, status: 'ASSIGNED' },
        { id: 'job_3', companyId: COMPANY, customerId: CUSTOMER, status: 'EN_ROUTE' },
    ]);
});

describe('GET /customers/:id', () => {
    it('reports lifetime value and outstanding across every invoice', async () => {
        const res = await request(app)
            .get(`/customers/${CUSTOMER}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        const summary = res.body.data.customer.summary;

        // Collected = total minus what is still owed, voids excluded.
        // (1518 - 0) + (2300 - 2300) + (1000 - 400) = 2118
        expect(summary.lifetimeValue).toBe(2118);
        // Owed = balance on live invoices: 2300 + 400
        expect(summary.outstanding).toBe(2700);
        expect(summary.invoiceCount).toBe(4);
    });

    it('counts every job, not just the embedded page', async () => {
        const res = await request(app)
            .get(`/customers/${CUSTOMER}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        const summary = res.body.data.customer.summary;
        expect(summary.jobCount).toBe(12);
        expect(res.body.data.customer.jobs).toHaveLength(1);
        // job_2 and job_3 are neither completed nor cancelled.
        expect(summary.openJobs).toBe(2);
    });

    it('is closed to technicians, who would otherwise see invoice totals', async () => {
        const res = await request(app)
            .get(`/customers/${CUSTOMER}`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));

        expect(res.status).toBe(403);
    });

    it('is open to the roles that work the CRM', async () => {
        for (const role of ['ADMIN', 'OFFICE', 'DISPATCHER', 'SALES'] as const) {
            const res = await request(app)
                .get(`/customers/${CUSTOMER}`)
                .set('Authorization', authHeader({ role }));
            expect(res.status, `role ${role}`).toBe(200);
        }
    });
});
