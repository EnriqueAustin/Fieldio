import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';
const TECH = 'user_test';

// Note: the in-memory fake does not evaluate OR/AND `where` trees, so it can't
// enforce the tech job-assignment scoping the way Postgres does. These tests
// therefore focus on the security-critical, DB-independent guarantee: the
// service must never return invoice (monetary) data to a technician.
function seedRecords() {
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Copper Estates', email: 'c@x.test', phone: '+27820000000' },
    ]);
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, techId: TECH, title: 'Copper geyser swap', status: 'ON_SITE', customer: { name: 'Copper Estates' } },
    ]);
    fakePrisma.invoice.seed([
        { id: 'inv_1', companyId: COMPANY, invoiceNumber: 'INV-Copper-01', status: 'SENT', total: 5400 },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedRecords();
});

describe('GET /search role scoping', () => {
    it('never returns invoices to a technician', async () => {
        const res = await request(app)
            .get('/search?q=copper')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        expect(res.body.data.invoices).toEqual([]);
        // Belt-and-braces: no invoice total leaks anywhere in the body.
        expect(JSON.stringify(res.body)).not.toMatch(/5400/);
        expect(JSON.stringify(res.body)).not.toMatch(/INV-Copper/);
    });

    it('returns invoices (with totals) to an office user', async () => {
        const res = await request(app)
            .get('/search?q=copper')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.body.data.invoices.length).toBeGreaterThan(0);
        expect(res.body.data.invoices[0].invoiceNumber).toBe('INV-Copper-01');
    });

    it('short-circuits on a term shorter than 2 characters', async () => {
        const res = await request(app)
            .get('/search?q=c')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ customers: [], jobs: [], invoices: [] });
    });
});
