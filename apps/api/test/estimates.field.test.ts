import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Replace the real database with the shared in-memory fake before any router
// (and its service layer) is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';

function seedJobWithPriceBook() {
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, customerId: 'cust_1', projectId: null },
    ]);
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Acme', email: 'a@acme.test', phone: null },
    ]);
    fakePrisma.priceBookItem.seed([
        { id: 'pb_labor', companyId: COMPANY, name: 'Labor', unitPrice: 150 },
        { id: 'pb_pipe', companyId: COMPANY, name: 'Copper pipe', unitPrice: 40 },
    ]);
    // No company row is seeded by default, so field quoting is treated as disabled
    // (default OFF) and notifyCustomer short-circuits.
}

// Opt the company into field quoting so a TECHNICIAN may quote on site.
function enableFieldQuoting() {
    fakePrisma.company.seed([
        { id: COMPANY, name: 'Acme Co', settings: { fieldQuoting: { enabled: true } } },
    ]);
}

const fieldPayload = {
    jobId: 'job_1',
    items: [
        { priceBookItemId: 'pb_labor', name: 'Labor', quantity: 2, type: 'LABOR' },
        { priceBookItemId: 'pb_pipe', name: 'Copper pipe', quantity: 3, type: 'MATERIAL' },
    ],
};

beforeEach(() => {
    fakePrisma.$reset();
    seedJobWithPriceBook();
});

describe('POST /finance/estimates/field (createFromField)', () => {
    it('allows a TECHNICIAN to create a field quote when the company has enabled it', async () => {
        enableFieldQuoting();
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send(fieldPayload);

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('success');
        expect(res.body.data.estimate.id).toBeTruthy();
    });

    it('prices the estimate server-side from the price book', async () => {
        // OFFICE receives the full estimate back, so we can assert the total.
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send(fieldPayload);

        expect(res.status).toBe(201);
        // 2 * 150 (labor) + 3 * 40 (pipe) = 420
        expect(res.body.data.estimate.total).toBe(420);
        expect(res.body.data.estimate.status).toBe('SENT');

        // Verify persisted line items carry the server-resolved unit prices.
        const stored = await fakePrisma.estimate.findFirst({ where: { id: res.body.data.estimate.id } });
        const items = stored.items as any[];
        expect(items.find((i) => i.priceBookItemId === 'pb_labor').unitPrice).toBe(150);
        expect(items.find((i) => i.priceBookItemId === 'pb_pipe').unitPrice).toBe(40);
    });

    it('ignores any client-supplied price and trusts the price book', async () => {
        const tampered = {
            jobId: 'job_1',
            items: [
                // Attacker tries to force a unit price / total via the payload.
                { priceBookItemId: 'pb_labor', name: 'Labor', quantity: 1, unitPrice: 0, total: 0, type: 'LABOR' },
            ],
        };
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send(tampered);

        expect(res.status).toBe(201);
        expect(res.body.data.estimate.total).toBe(150); // from price book, not the 0 sent
    });

    it('does NOT leak prices/costs back to a TECHNICIAN', async () => {
        enableFieldQuoting();
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send(fieldPayload);

        expect(res.status).toBe(201);
        const estimate = res.body.data.estimate;

        // The tech-facing shape is intentionally price-free.
        expect(estimate).toHaveProperty('itemCount', 2);
        expect(estimate).not.toHaveProperty('total');
        expect(estimate).not.toHaveProperty('items');

        // Belt-and-braces: no price/cost fields anywhere in the serialized body.
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/unitPrice/i);
        expect(body).not.toMatch(/"total"/);
        expect(body).not.toMatch(/cost/i);
    });

    it('rejects a field quote for a job in another company', async () => {
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', companyId: 'other_co' }))
            .send(fieldPayload);

        expect(res.status).toBe(404); // job not found under that company
    });

    it('requires authentication', async () => {
        const res = await request(app).post('/finance/estimates/field').send(fieldPayload);
        expect(res.status).toBe(401);
    });
});

describe('field quoting company setting (default OFF) gates the TECHNICIAN', () => {
    it('rejects a TECHNICIAN with 403 when field quoting is disabled (default)', async () => {
        // No company row seeded -> setting defaults to disabled.
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send(fieldPayload);

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/field quoting/i);
    });

    it('allows a TECHNICIAN with 200/201 when the company enables field quoting', async () => {
        enableFieldQuoting();
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send(fieldPayload);

        expect(res.status).toBe(201);
        expect(res.body.data.estimate.id).toBeTruthy();
    });

    it('still allows OFFICE to field-quote even when the setting is disabled', async () => {
        // No company row -> disabled, but office/admin are never gated by the flag.
        const res = await request(app)
            .post('/finance/estimates/field')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send(fieldPayload);

        expect(res.status).toBe(201);
    });
});

describe('staff-only estimate routes reject TECHNICIAN', () => {
    const tech = () => authHeader({ role: 'TECHNICIAN' });

    it('POST /finance/estimates is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', tech())
            .send({ customerId: 'cust_1', items: [], total: 0 });
        expect(res.status).toBe(403);
    });

    it('POST /finance/estimates/:id/approve is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_1/approve')
            .set('Authorization', tech())
            .send({ signerName: 'Bob', signatureUrl: 'https://x/sig.png' });
        expect(res.status).toBe(403);
    });

    it('POST /finance/estimates/:id/convert is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_1/convert')
            .set('Authorization', tech())
            .send({});
        expect(res.status).toBe(403);
    });

    it('allows OFFICE to reach the staff create handler (not 403)', async () => {
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ customerId: 'cust_1', items: [], total: 99 });
        expect(res.status).toBe(201);
        expect(res.body.data.estimate.total).toBe(99);
    });
});
