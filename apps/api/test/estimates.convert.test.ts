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
const office = authHeader({ role: 'OFFICE', companyId: COMPANY, userId: 'office_1' });

const lines = [
    { name: 'Replace geyser element', quantity: 1, unitPrice: 450, type: 'MATERIAL' },
    { name: 'Labour', quantity: 2, unitPrice: 300, type: 'LABOR' },
];

function seed() {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings: {} }]);
    fakePrisma.company.seed([{ id: 'company_2', name: 'Other Co', settings: {} }]);
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Thabo' },
        { id: 'cust_other', companyId: 'company_2', name: 'Not ours' },
    ]);
    fakePrisma.property.seed([
        { id: 'prop_1', companyId: COMPANY, customerId: 'cust_1', addressLine1: '1 Main Rd' },
        { id: 'prop_2', companyId: COMPANY, customerId: 'cust_1', addressLine1: '2 Side St' },
        { id: 'prop_other', companyId: 'company_2', customerId: 'cust_other', addressLine1: '9 Far Rd' },
    ]);
    fakePrisma.estimate.seed(
        (['DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED'] as const).map((status) => ({
            id: `est_${status.toLowerCase()}`,
            companyId: COMPANY,
            customerId: 'cust_1',
            status,
            items: lines,
            total: 1050,
            jobId: null,
        }))
    );
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('POST /finance/estimates — tenancy', () => {
    const body = (over: Record<string, unknown> = {}) => ({
        customerId: 'cust_1',
        items: lines,
        total: 1050,
        ...over,
    });

    it('creates a quote for the caller own customer', async () => {
        const res = await request(app).post('/finance/estimates').set('Authorization', office).send(body());
        expect(res.status).toBe(201);
        expect(res.body.data.estimate.companyId).toBe(COMPANY);
    });

    it('404s for a customer that belongs to another company', async () => {
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', office)
            .send(body({ customerId: 'cust_other' }));
        expect(res.status).toBe(404);
        expect(fakePrisma.estimate.rows.filter((r: any) => r.customerId === 'cust_other')).toHaveLength(0);
    });

    it('404s for an unknown customer', async () => {
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', office)
            .send(body({ customerId: 'nope' }));
        expect(res.status).toBe(404);
    });

    it('404s for a project from another company', async () => {
        const projectId = '6f1c2f6e-3f55-4a3e-9d0a-1f2b3c4d5e6f';
        fakePrisma.project.seed([{ id: projectId, companyId: 'company_2', name: 'X' }]);
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', office)
            .send(body({ projectId }));
        expect(res.status).toBe(404);
    });

    it('400s when customerId is missing (not a 500)', async () => {
        const res = await request(app)
            .post('/finance/estimates')
            .set('Authorization', office)
            .send({ items: lines, total: 1050 });
        expect(res.status).toBe(400);
    });
});

describe('POST /finance/estimates/:id/convert', () => {
    it.each(['sent', 'approved'])('converts a %s quote into a job with a readable title and its lines', async (s) => {
        const res = await request(app).post(`/finance/estimates/est_${s}/convert`).set('Authorization', office).send({});
        expect(res.status).toBe(200);

        const job = res.body.data.job;
        expect(job.title).toBe('Replace geyser element (+1 more)');
        expect(job.title).not.toMatch(/Job from Estimate/);
        // No property chosen: the customer's first property is used.
        expect(job.propertyId).toBe('prop_1');

        const created = fakePrisma.jobLineItem.rows.filter((r: any) => r.jobId === job.id);
        expect(created).toHaveLength(2);
        expect(created.map((r: any) => r.type)).toEqual(['MATERIAL', 'LABOR']);
        expect(created[1].total).toBe(600);
    });

    it.each(['draft', 'declined', 'expired'])('refuses a %s quote (400) without creating a job', async (s) => {
        const res = await request(app).post(`/finance/estimates/est_${s}/convert`).set('Authorization', office).send({});
        expect(res.status).toBe(400);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('is 409 when the quote was already converted', async () => {
        fakePrisma.estimate.rows.find((r: any) => r.id === 'est_approved').jobId = 'job_existing';
        const res = await request(app).post('/finance/estimates/est_approved/convert').set('Authorization', office).send({});
        expect(res.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('claims the quote atomically: a concurrent winner makes the loser 409', async () => {
        // Simulate a second convert committing between our read and our claim:
        // when our job is created, the quote is already linked to someone else's job.
        const original = fakePrisma.job.create.bind(fakePrisma.job);
        fakePrisma.job.create = async (args: any) => {
            fakePrisma.estimate.rows.find((r: any) => r.id === 'est_sent').jobId = 'job_winner';
            return original(args);
        };
        try {
            const res = await request(app).post('/finance/estimates/est_sent/convert').set('Authorization', office).send({});
            expect(res.status).toBe(409);
            // The winner's link is untouched by the loser.
            expect(fakePrisma.estimate.rows.find((r: any) => r.id === 'est_sent').jobId).toBe('job_winner');
        } finally {
            fakePrisma.job.create = original;
        }
    });

    it('links the quote to the new job and approves it (so a second convert is 409)', async () => {
        const first = await request(app).post('/finance/estimates/est_sent/convert').set('Authorization', office).send({});
        expect(first.status).toBe(200);
        const est = fakePrisma.estimate.rows.find((r: any) => r.id === 'est_sent');
        expect(est.jobId).toBe(first.body.data.job.id);
        expect(est.status).toBe('APPROVED');

        const second = await request(app).post('/finance/estimates/est_sent/convert').set('Authorization', office).send({});
        expect(second.status).toBe(409);
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('uses the property the office picked, and 404s for a property that is not the customer own', async () => {
        const ok = await request(app)
            .post('/finance/estimates/est_sent/convert')
            .set('Authorization', office)
            .send({ propertyId: 'prop_2' });
        expect(ok.status).toBe(200);
        expect(ok.body.data.job.propertyId).toBe('prop_2');

        const bad = await request(app)
            .post('/finance/estimates/est_approved/convert')
            .set('Authorization', office)
            .send({ propertyId: 'prop_other' });
        expect(bad.status).toBe(404);
    });

    it('rejects an invalid line type with 400, not a 500', async () => {
        fakePrisma.estimate.rows.find((r: any) => r.id === 'est_sent').items = [
            { name: 'Mystery', quantity: 1, unitPrice: 10, type: 'WIDGET' },
        ];
        const res = await request(app).post('/finance/estimates/est_sent/convert').set('Authorization', office).send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid type/);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('404s for another company quote', async () => {
        const res = await request(app)
            .post('/finance/estimates/est_sent/convert')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'company_2', userId: 'o2' }))
            .send({});
        expect(res.status).toBe(404);
    });
});
