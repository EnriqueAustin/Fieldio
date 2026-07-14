import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp } from './helpers/app';

const app = buildTestApp();

const CO_A = 'company_A';
const CO_B = 'company_B';
const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const PAST = new Date('2000-01-01T00:00:00.000Z');

function seed() {
    fakePrisma.customer.seed([
        { id: 'custA', companyId: CO_A, name: 'Alice' },
        { id: 'custB', companyId: CO_B, name: 'Bob' },
    ]);
    fakePrisma.customerPortalToken.seed([
        { id: 'tokrowA', token: 'valid-token-A', customerId: 'custA', companyId: CO_A, expiresAt: FUTURE },
        { id: 'tokrowB', token: 'valid-token-B', customerId: 'custB', companyId: CO_B, expiresAt: FUTURE },
        { id: 'tokexp', token: 'expired-token', customerId: 'custA', companyId: CO_A, expiresAt: PAST },
    ]);
    fakePrisma.estimate.seed([
        { id: 'estA_sent', companyId: CO_A, customerId: 'custA', status: 'SENT', total: 500, items: [] },
        { id: 'estA_approved', companyId: CO_A, customerId: 'custA', status: 'APPROVED', total: 500, items: [] },
        { id: 'estA_declined', companyId: CO_A, customerId: 'custA', status: 'DECLINED', total: 500, items: [] },
        { id: 'estB_sent', companyId: CO_B, customerId: 'custB', status: 'SENT', total: 900, items: [] },
    ]);
}

const sig = { signerName: 'Alice', signatureUrl: 'https://cdn.test/sig.png' };

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('POST /public/portal/:token/estimates/:id/approve', () => {
    it('approves a SENT estimate with a valid token', async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-A/estimates/estA_sent/approve')
            .send(sig);

        expect(res.status).toBe(200);
        expect(res.body.data.estimate.status).toBe('APPROVED');
        expect(res.body.data.estimate.signerName).toBe('Alice');
    });

    it('rejects an invalid/unknown token', async () => {
        const res = await request(app)
            .post('/public/portal/nope/estimates/estA_sent/approve')
            .send(sig);
        expect(res.status).toBe(404);
    });

    it('rejects an expired token', async () => {
        const res = await request(app)
            .post('/public/portal/expired-token/estimates/estA_sent/approve')
            .send(sig);
        expect(res.status).toBe(410);
    });

    it("rejects approving another company's estimate via a valid token", async () => {
        // Company B's token must not be able to approve Company A's estimate.
        const res = await request(app)
            .post('/public/portal/valid-token-B/estimates/estA_sent/approve')
            .send(sig);
        expect(res.status).toBe(404);

        const still = await fakePrisma.estimate.findFirst({ where: { id: 'estA_sent' } });
        expect(still.status).toBe('SENT'); // untouched
    });

    it('rejects re-approving an already-approved estimate', async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-A/estimates/estA_approved/approve')
            .send(sig);
        expect(res.status).toBe(400);
    });

    it('validates the signature payload', async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-A/estimates/estA_sent/approve')
            .send({ signerName: 'Alice', signatureUrl: 'http://insecure/sig.png' });
        expect(res.status).toBe(400); // must be https:// or data:image
    });
});

describe('POST /public/portal/:token/estimates/:id/decline', () => {
    it('declines a SENT estimate with a valid token', async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-A/estimates/estA_sent/decline')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.data.estimate.status).toBe('DECLINED');
    });

    it('rejects declining an already-declined estimate', async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-A/estimates/estA_declined/decline')
            .send({});
        expect(res.status).toBe(400);
    });

    it("rejects declining another company's estimate", async () => {
        const res = await request(app)
            .post('/public/portal/valid-token-B/estimates/estA_sent/decline')
            .send({});
        expect(res.status).toBe(404);
    });

    it('rejects an invalid token', async () => {
        const res = await request(app)
            .post('/public/portal/bogus/estimates/estA_sent/decline')
            .send({});
        expect(res.status).toBe(404);
    });
});
