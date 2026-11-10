import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// SARS requires the buyer's VAT number and billing address on a tax invoice
// over R5,000. The office must be able to capture them on create/update and via
// the CSV import, and a malformed VAT number must be rejected.

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
const office = authHeader({ role: 'OFFICE' });

beforeEach(() => {
    fakePrisma.$reset();
});

describe('POST /customers with tax details', () => {
    it('round-trips vatNumber and billingAddress', async () => {
        const res = await request(app)
            .post('/customers')
            .set('Authorization', office)
            .send({
                name: 'Braamfontein Body Corporate',
                vatNumber: '4123456789',
                billingAddress: 'PO Box 100, Sandton, 2146',
            });

        expect(res.status).toBe(201);
        expect(res.body.data.customer.vatNumber).toBe('4123456789');
        expect(res.body.data.customer.billingAddress).toBe('PO Box 100, Sandton, 2146');

        const stored = await fakePrisma.customer.findFirst({
            where: { id: res.body.data.customer.id },
        });
        expect(stored.vatNumber).toBe('4123456789');
        expect(stored.billingAddress).toBe('PO Box 100, Sandton, 2146');
    });

    it('rejects a malformed VAT number with 400', async () => {
        const res = await request(app)
            .post('/customers')
            .set('Authorization', office)
            .send({ name: 'Bad VAT Co', vatNumber: '12345' });

        expect(res.status).toBe(400);
    });

    it('also rejects a VAT number that does not start with 4', async () => {
        const res = await request(app)
            .post('/customers')
            .set('Authorization', office)
            .send({ name: 'Wrong Prefix Co', vatNumber: '5123456789' });

        expect(res.status).toBe(400);
    });

    it('accepts an empty VAT number (stored as null)', async () => {
        const res = await request(app)
            .post('/customers')
            .set('Authorization', office)
            .send({ name: 'No VAT Co', vatNumber: '' });

        expect(res.status).toBe(201);
        expect(res.body.data.customer.vatNumber).toBeNull();
    });
});

describe('PATCH /customers/:id with tax details', () => {
    beforeEach(() => {
        fakePrisma.customer.seed([
            { id: 'cust_1', companyId: COMPANY, name: 'Existing Co', vatNumber: null, billingAddress: null },
        ]);
    });

    it('sets vatNumber and billingAddress', async () => {
        const res = await request(app)
            .patch('/customers/cust_1')
            .set('Authorization', office)
            .send({ vatNumber: '4987654321', billingAddress: '12 Oak Ave, Sandton' });

        expect(res.status).toBe(200);
        expect(res.body.data.customer.vatNumber).toBe('4987654321');
        expect(res.body.data.customer.billingAddress).toBe('12 Oak Ave, Sandton');
    });

    it('clears the VAT number when sent empty or null', async () => {
        fakePrisma.customer.seed([
            { id: 'cust_2', companyId: COMPANY, name: 'Had VAT Co', vatNumber: '4123456789', billingAddress: 'x' },
        ]);

        const res = await request(app)
            .patch('/customers/cust_2')
            .set('Authorization', office)
            .send({ vatNumber: null, billingAddress: '' });

        expect(res.status).toBe(200);
        expect(res.body.data.customer.vatNumber).toBeNull();
        expect(res.body.data.customer.billingAddress).toBeNull();
    });

    it('rejects a malformed VAT number with 400', async () => {
        const res = await request(app)
            .patch('/customers/cust_1')
            .set('Authorization', office)
            .send({ vatNumber: '4abc' });

        expect(res.status).toBe(400);
    });
});

describe('POST /customers/import with a VAT column', () => {
    it('maps a mapped VAT column onto the created customer', async () => {
        // The web import page maps a "VAT No" header to the `vatNumber` key before
        // posting, so the endpoint receives rows already keyed by field name.
        const res = await request(app)
            .post('/customers/import')
            .set('Authorization', office)
            .send({
                rows: [
                    { name: 'Imported Co', vatNumber: '4123456789', billingAddress: 'PO Box 7, Durban' },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(1);

        const stored = await fakePrisma.customer.findFirst({ where: { name: 'Imported Co' } });
        expect(stored.vatNumber).toBe('4123456789');
        expect(stored.billingAddress).toBe('PO Box 7, Durban');
    });

    it('reports a row with an invalid VAT number as failed, not the whole import', async () => {
        const res = await request(app)
            .post('/customers/import')
            .set('Authorization', office)
            .send({
                rows: [
                    { name: 'Good Co', vatNumber: '4123456789' },
                    { name: 'Bad Co', vatNumber: 'not-a-vat' },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(1);
        expect(res.body.data.failed).toBe(1);
        expect(res.body.data.errors[0].row).toBe(2);
    });
});
