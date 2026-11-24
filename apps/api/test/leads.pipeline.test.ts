import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

// Swap the real database for the shared in-memory fake before routers import it.
import { vi } from 'vitest';
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';

function seed() {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings: {} }]);
    fakePrisma.leadSource.seed([
        { id: 'src_google', companyId: COMPANY, name: 'Google Ads', costPerMonth: 1000, active: true },
    ]);
    fakePrisma.customer.seed([
        { id: 'lead_1', companyId: COMPANY, name: 'Sipho', phone: '0821234567', email: null, status: 'LEAD', leadStage: 'NEW', leadValue: 5000, leadSourceId: 'src_google', billingAddress: '1 Main Rd' },
        { id: 'lead_2', companyId: COMPANY, name: 'Thabo', phone: null, email: null, status: 'LEAD', leadStage: 'QUALIFIED', leadValue: null, leadSourceId: null },
        // A lead belonging to another company — must never leak.
        { id: 'lead_other', companyId: 'company_2', name: 'Intruder', status: 'LEAD', leadStage: 'NEW' },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('POST /leads (create lead)', () => {
    it('creates a lead as a LEAD customer scoped to the company', async () => {
        const res = await request(app)
            .post('/leads')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ name: 'New Guy', phone: '0730000000', leadValue: 1200, leadSourceId: 'src_google', leadStage: 'CONTACTED' });
        expect(res.status).toBe(201);
        expect(res.body.data.lead.name).toBe('New Guy');
        expect(res.body.data.lead.status).toBe('LEAD');
        expect(res.body.data.lead.leadStage).toBe('CONTACTED');
        expect(res.body.data.lead.companyId).toBe(COMPANY);
    });

    it('rejects an unknown lead source', async () => {
        const res = await request(app)
            .post('/leads')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ name: 'X', leadSourceId: 'does_not_exist' });
        expect(res.status).toBe(400);
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/leads')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ name: 'Nope' });
        expect(res.status).toBe(403);
    });
});

describe('PATCH /leads/:id (edit lead)', () => {
    it('edits name/phone/value', async () => {
        const res = await request(app)
            .patch('/leads/lead_1')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ name: 'Sipho M', phone: '0829999999', leadValue: 7500 });
        expect(res.status).toBe(200);
        expect(res.body.data.lead.name).toBe('Sipho M');
        const stored = await fakePrisma.customer.findFirst({ where: { id: 'lead_1' } });
        expect(stored.phone).toBe('0829999999');
        expect(stored.leadValue).toBe(7500);
    });

    it('cannot edit a lead from another company', async () => {
        const res = await request(app)
            .patch('/leads/lead_other')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ name: 'Hacked' });
        expect(res.status).toBe(404);
    });
});

describe('leads contact notes', () => {
    it('logs and lists a contact note with a timestamp', async () => {
        const create = await request(app)
            .post('/leads/lead_1/notes')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ type: 'CALL_OUTBOUND', body: 'Left a voicemail' });
        expect(create.status).toBe(201);
        expect(create.body.data.note.body).toBe('Left a voicemail');
        expect(create.body.data.note.createdAt).toBeTruthy();

        const list = await request(app)
            .get('/leads/lead_1/notes')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(list.status).toBe(200);
        expect(list.body.data.notes).toHaveLength(1);
        expect(list.body.data.notes[0].type).toBe('CALL_OUTBOUND');
    });

    it('rejects an empty note body', async () => {
        const res = await request(app)
            .post('/leads/lead_1/notes')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ body: '' });
        expect(res.status).toBe(400);
    });
});

describe('PATCH /leads/sources/:id (edit source)', () => {
    it('updates name and monthly cost', async () => {
        const res = await request(app)
            .patch('/leads/sources/src_google')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ name: 'Google Search', costPerMonth: 2500 });
        expect(res.status).toBe(200);
        expect(res.body.data.source.name).toBe('Google Search');
        expect(res.body.data.source.costPerMonth).toBe(2500);
    });

    it('is forbidden for SALES (office-managed)', async () => {
        const res = await request(app)
            .patch('/leads/sources/src_google')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ costPerMonth: 1 });
        expect(res.status).toBe(403);
    });
});

describe('POST /leads/:id/convert', () => {
    it('converts to a DRAFT quote and marks the lead WON', async () => {
        const res = await request(app)
            .post('/leads/lead_1/convert')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ target: 'QUOTE' });
        expect(res.status).toBe(201);
        expect(res.body.data.estimateId).toBeTruthy();

        const estimate = await fakePrisma.estimate.findFirst({ where: { id: res.body.data.estimateId } });
        expect(estimate.customerId).toBe('lead_1');
        expect(estimate.status).toBe('DRAFT');
        expect(Number(estimate.total)).toBe(5000); // from leadValue

        const lead = await fakePrisma.customer.findFirst({ where: { id: 'lead_1' } });
        expect(lead.leadStage).toBe('WON');
        expect(lead.status).toBe('ACTIVE');
        expect(lead.wonAt).toBeTruthy();
    });

    it('converts to a job, creating a property from the carried address', async () => {
        const res = await request(app)
            .post('/leads/lead_2/convert')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ target: 'JOB', title: 'Geyser install', address: { line1: '5 Oak Ave', city: 'Durban', state: 'KZN', zip: '4001' } });
        expect(res.status).toBe(201);
        expect(res.body.data.jobId).toBeTruthy();

        const job = await fakePrisma.job.findFirst({ where: { id: res.body.data.jobId } });
        expect(job.customerId).toBe('lead_2');
        expect(job.title).toBe('Geyser install');
        const property = await fakePrisma.property.findFirst({ where: { id: job.propertyId } });
        expect(property.customerId).toBe('lead_2');
        expect(property.addressLine1).toBe('5 Oak Ave');

        const lead = await fakePrisma.customer.findFirst({ where: { id: 'lead_2' } });
        expect(lead.leadStage).toBe('WON');
    });

    it('is forbidden for SALES (quoting is an office function)', async () => {
        const res = await request(app)
            .post('/leads/lead_1/convert')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ target: 'QUOTE' });
        expect(res.status).toBe(403);
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .post('/leads/lead_1/convert')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ target: 'QUOTE' });
        expect(res.status).toBe(403);
    });
});

describe('PATCH /leads/:id/stage', () => {
    it('rejects an invalid stage', async () => {
        const res = await request(app)
            .patch('/leads/lead_1/stage')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ stage: 'BOGUS' });
        expect(res.status).toBe(400);
    });

    it('moves a lead to CONTACTED', async () => {
        const res = await request(app)
            .patch('/leads/lead_1/stage')
            .set('Authorization', authHeader({ role: 'SALES' }))
            .send({ stage: 'CONTACTED' });
        expect(res.status).toBe(200);
        const lead = await fakePrisma.customer.findFirst({ where: { id: 'lead_1' } });
        expect(lead.leadStage).toBe('CONTACTED');
    });
});

describe('GET /leads/pipeline', () => {
    it('groups only this company\'s LEAD customers by stage', async () => {
        const res = await request(app)
            .get('/leads/pipeline')
            .set('Authorization', authHeader({ role: 'SALES' }));
        expect(res.status).toBe(200);
        expect(res.body.data.byStage.NEW.map((l: any) => l.id)).toEqual(['lead_1']);
        expect(res.body.data.byStage.QUALIFIED.map((l: any) => l.id)).toEqual(['lead_2']);
        // other company's lead never appears
        const allIds = Object.values(res.body.data.byStage).flat().map((l: any) => l.id);
        expect(allIds).not.toContain('lead_other');
    });

    it('is forbidden for TECHNICIAN', async () => {
        const res = await request(app)
            .get('/leads/pipeline')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});
