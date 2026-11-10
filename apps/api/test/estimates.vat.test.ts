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

// A VAT-registered company (has a tax number) at the SA standard 15% rate.
function seedVatRegistered() {
    fakePrisma.company.seed([
        {
            id: COMPANY,
            name: 'Mthembu Plumbing',
            settings: {
                billing: { taxLabel: 'VAT', taxRate: 15, taxNumber: '4123456789' },
                fieldQuoting: { enabled: true },
            },
        },
    ]);
}

// A non-VAT-registered company (no tax number). Must never charge VAT.
function seedNonVatRegistered() {
    fakePrisma.company.seed([
        {
            id: COMPANY,
            name: 'Small Plumber',
            settings: {
                billing: { taxLabel: 'VAT', taxRate: 15, taxNumber: '' },
                fieldQuoting: { enabled: true },
            },
        },
    ]);
}

function seedCustomerAndJob() {
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Acme', email: 'a@acme.test', phone: null },
    ]);
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, customerId: 'cust_1', projectId: null },
    ]);
    fakePrisma.priceBookItem.seed([
        { id: 'pb_a', companyId: COMPANY, name: 'Call-out', unitPrice: 100 },
        { id: 'pb_b', companyId: COMPANY, name: 'Parts', unitPrice: 233.33 },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedCustomerAndJob();
});

describe('POST /finance/estimates — VAT breakdown on create', () => {
    it('computes subtotal, VAT and total for a VAT-registered company', async () => {
        seedVatRegistered();
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                customerId: 'cust_1',
                items: [
                    { name: 'Call-out', quantity: 1, unitPrice: 100, total: 100, type: 'SERVICE' },
                    { name: 'Parts', quantity: 1, unitPrice: 233.33, total: 233.33, type: 'MATERIAL' },
                ],
                total: 333.33,
            });

        expect(res.status).toBe(201);
        const est = res.body.data.estimate;
        // 100 + 233.33 = 333.33 subtotal; 15% VAT = 50.00; total = 383.33
        expect(Number(est.subtotal)).toBe(333.33);
        expect(Number(est.tax)).toBe(50);
        expect(Number(est.taxRate)).toBe(15);
        expect(est.taxLabel).toBe('VAT');
        expect(Number(est.total)).toBe(383.33);
    });

    it('charges no VAT when the company has no tax number (not VAT-registered)', async () => {
        seedNonVatRegistered();
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                customerId: 'cust_1',
                items: [{ name: 'Call-out', quantity: 1, unitPrice: 100, total: 100, type: 'SERVICE' }],
                total: 100,
            });

        expect(res.status).toBe(201);
        const est = res.body.data.estimate;
        expect(Number(est.subtotal)).toBe(100);
        expect(Number(est.tax)).toBe(0);
        expect(Number(est.taxRate)).toBe(0);
        expect(est.taxLabel).toBeNull();
        expect(Number(est.total)).toBe(100);
    });

    it('ignores the client-sent total and recomputes the subtotal from line items', async () => {
        seedVatRegistered();
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                customerId: 'cust_1',
                // Tampered total; the server must trust the line totals instead.
                items: [{ name: 'Call-out', quantity: 2, unitPrice: 100, total: 200, type: 'SERVICE' }],
                total: 1,
            });

        expect(res.status).toBe(201);
        const est = res.body.data.estimate;
        expect(Number(est.subtotal)).toBe(200);
        expect(Number(est.tax)).toBe(30); // 200 * 15%
        expect(Number(est.total)).toBe(230);
    });
});

describe('POST /finance/estimates/field — VAT on field quotes', () => {
    it('applies VAT from settings and never leaks prices to a TECHNICIAN', async () => {
        seedVatRegistered();
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({
                jobId: 'job_1',
                items: [{ priceBookItemId: 'pb_a', name: 'Call-out', quantity: 1, type: 'SERVICE' }],
            });

        expect(res.status).toBe(201);
        const est = res.body.data.estimate;
        // Tech-facing shape is intentionally price-free.
        expect(est).toHaveProperty('itemCount', 1);
        expect(est).not.toHaveProperty('total');
        expect(est).not.toHaveProperty('subtotal');
        expect(est).not.toHaveProperty('tax');
        expect(est).not.toHaveProperty('items');

        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/unitPrice/i);
        expect(body).not.toMatch(/"total"/);
        expect(body).not.toMatch(/"subtotal"/);
        expect(body).not.toMatch(/cost/i);

        // But the persisted estimate carries the VAT breakdown for the office.
        const stored = await fakePrisma.estimate.findFirst({ where: { id: est.id } });
        expect(Number(stored.subtotal)).toBe(100);
        expect(Number(stored.tax)).toBe(15);
        expect(Number(stored.total)).toBe(115);
    });

    it('returns the VAT-inclusive estimate to OFFICE', async () => {
        seedVatRegistered();
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                jobId: 'job_1',
                items: [{ priceBookItemId: 'pb_b', name: 'Parts', quantity: 1, type: 'MATERIAL' }],
            });

        expect(res.status).toBe(201);
        const est = res.body.data.estimate;
        expect(Number(est.subtotal)).toBe(233.33);
        expect(Number(est.tax)).toBe(35); // 233.33 * 15% = 34.9995 -> 35.00
        expect(Number(est.total)).toBe(268.33);
    });
});

describe('GET /public/portal/:token — estimate payload includes VAT breakdown', () => {
    it('exposes subtotal, tax, taxRate and taxLabel to the portal', async () => {
        seedVatRegistered();
        fakePrisma.customerPortalToken.seed([
            {
                id: 'tok1',
                token: 'portal-token',
                customerId: 'cust_1',
                companyId: COMPANY,
                expiresAt: new Date('2099-01-01T00:00:00.000Z'),
                // The fake doesn't resolve `include`, so the related customer rides on the row.
                customer: { id: 'cust_1', name: 'Acme', email: null, phone: null },
            },
        ]);
        fakePrisma.estimate.seed([
            {
                id: 'est_1',
                companyId: COMPANY,
                customerId: 'cust_1',
                status: 'SENT',
                items: [],
                subtotal: 333.33,
                tax: 50,
                taxRate: 15,
                taxLabel: 'VAT',
                total: 383.33,
            },
        ]);

        const res = await request(app).get('/public/portal/portal-token');
        expect(res.status).toBe(200);
        const est = res.body.data.estimates.find((e: any) => e.id === 'est_1');
        expect(est).toBeTruthy();
        expect(Number(est.subtotal)).toBe(333.33);
        expect(Number(est.tax)).toBe(50);
        expect(Number(est.taxRate)).toBe(15);
        expect(est.taxLabel).toBe('VAT');
        expect(Number(est.total)).toBe(383.33);
    });
});
