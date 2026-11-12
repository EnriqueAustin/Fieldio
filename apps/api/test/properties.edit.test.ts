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
const OTHER_COMPANY = 'company_2';
const CUSTOMER = 'cust_1';
const OTHER_CUSTOMER = 'cust_2';

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.customer.seed([
        { id: CUSTOMER, companyId: COMPANY, name: 'Mthembu Plumbing' },
        { id: OTHER_CUSTOMER, companyId: COMPANY, name: 'Braamfontein Body Corporate' },
    ]);
    fakePrisma.property.seed([
        // Belongs to CUSTOMER in COMPANY — the happy-path target.
        {
            id: 'prop_1',
            companyId: COMPANY,
            customerId: CUSTOMER,
            addressLine1: '12 Jan Smuts Avenue',
            addressLine2: null,
            city: 'Johannesburg',
            state: 'GP',
            zip: '2196',
        },
        // Belongs to OTHER_CUSTOMER, same company — cross-customer target.
        {
            id: 'prop_other_customer',
            companyId: COMPANY,
            customerId: OTHER_CUSTOMER,
            addressLine1: '1 Empire Road',
            city: 'Johannesburg',
            state: 'GP',
            zip: '2001',
        },
        // Belongs to another company — cross-tenant target.
        {
            id: 'prop_other_company',
            companyId: OTHER_COMPANY,
            customerId: CUSTOMER,
            addressLine1: '99 Somewhere Else',
            city: 'Cape Town',
            state: 'WC',
            zip: '8001',
        },
    ]);
});

describe('PATCH /customers/:customerId/properties/:propertyId', () => {
    it('updates a site that belongs to the customer and company', async () => {
        const res = await request(app)
            .patch(`/customers/${CUSTOMER}/properties/prop_1`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY }))
            .send({ addressLine1: '14 Jan Smuts Avenue', city: 'Randburg', zip: '2194' });

        expect(res.status).toBe(200);
        expect(res.body.data.property.addressLine1).toBe('14 Jan Smuts Avenue');
        expect(res.body.data.property.city).toBe('Randburg');
        expect(res.body.data.property.zip).toBe('2194');
    });

    it('404s when the site is in another company', async () => {
        const res = await request(app)
            .patch(`/customers/${CUSTOMER}/properties/prop_other_company`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY }))
            .send({ city: 'Hijacked' });

        expect(res.status).toBe(404);
    });

    it('404s when the site belongs to a different customer', async () => {
        const res = await request(app)
            .patch(`/customers/${CUSTOMER}/properties/prop_other_customer`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY }))
            .send({ city: 'Wrong customer' });

        expect(res.status).toBe(404);
    });
});

describe('DELETE /customers/:customerId/properties/:propertyId', () => {
    it('deletes a site with no jobs', async () => {
        const res = await request(app)
            .delete(`/customers/${CUSTOMER}/properties/prop_1`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }));

        expect(res.status).toBe(200);
        expect(await fakePrisma.property.findFirst({ where: { id: 'prop_1' } })).toBeNull();
    });

    it('409s when the site still has jobs linked to it', async () => {
        fakePrisma.job.seed([
            { id: 'job_1', companyId: COMPANY, customerId: CUSTOMER, propertyId: 'prop_1', status: 'ASSIGNED' },
        ]);

        const res = await request(app)
            .delete(`/customers/${CUSTOMER}/properties/prop_1`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }));

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/jobs/i);
        // The site must still be on file.
        expect(await fakePrisma.property.findFirst({ where: { id: 'prop_1' } })).not.toBeNull();
    });

    it('404s when the site is in another company', async () => {
        const res = await request(app)
            .delete(`/customers/${CUSTOMER}/properties/prop_other_company`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }));

        expect(res.status).toBe(404);
    });

    it('404s when the site belongs to a different customer', async () => {
        const res = await request(app)
            .delete(`/customers/${CUSTOMER}/properties/prop_other_customer`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }));

        expect(res.status).toBe(404);
    });
});
