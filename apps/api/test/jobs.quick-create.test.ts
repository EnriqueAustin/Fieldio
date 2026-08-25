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

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
// The quick-create payload validates these as UUIDs.
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PROPERTY_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.customer.seed([{ id: CUSTOMER_ID, companyId: COMPANY, name: 'Braamfontein Body Corporate' }]);
    fakePrisma.property.seed([
        {
            id: PROPERTY_ID,
            companyId: COMPANY,
            customerId: CUSTOMER_ID,
            addressLine1: '152 Smit Street',
            city: 'Braamfontein',
            state: 'GP',
            zip: '2001',
        },
    ]);
});

const baseBody = {
    customerName: 'Braamfontein Body Corporate',
    title: 'Leaking basin tap',
};

describe('POST /jobs/quick', () => {
    it('reuses an existing site instead of duplicating the address', async () => {
        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ...baseBody, existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID });

        expect(res.status).toBe(201);
        expect(res.body.data.job.propertyId).toBe(PROPERTY_ID);
        // The whole point: no second copy of the same address.
        expect(fakePrisma.property.rows).toHaveLength(1);
    });

    it('does not require an address when booking at a site on file', async () => {
        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ...baseBody, existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID });

        expect(res.status).toBe(201);
    });

    it('still requires an address when creating a new site', async () => {
        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ...baseBody, existingCustomerId: CUSTOMER_ID });

        expect(res.status).toBe(400);
        const fields = res.body.errors.map((e: any) => e.field);
        expect(fields).toContain('addressLine1');
        expect(fields).toContain('city');
    });

    it('creates the site when a new address is supplied', async () => {
        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                ...baseBody,
                existingCustomerId: CUSTOMER_ID,
                addressLine1: '7 Protea Lane',
                city: 'Northcliff',
            });

        expect(res.status).toBe(201);
        expect(fakePrisma.property.rows).toHaveLength(2);
    });

    it('rejects a site that belongs to a different customer', async () => {
        fakePrisma.property.seed([
            {
                id: OTHER_PROPERTY_ID,
                companyId: COMPANY,
                customerId: OTHER_CUSTOMER_ID,
                addressLine1: 'Somewhere else',
                city: 'Durban',
            },
        ]);

        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ...baseBody, existingCustomerId: CUSTOMER_ID, existingPropertyId: OTHER_PROPERTY_ID });

        expect(res.status).toBe(404);
    });

    it('is closed to technicians', async () => {
        const res = await request(app)
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ ...baseBody, existingCustomerId: CUSTOMER_ID, existingPropertyId: PROPERTY_ID });

        expect(res.status).toBe(403);
    });
});
