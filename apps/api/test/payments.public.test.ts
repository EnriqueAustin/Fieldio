import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp } from './helpers/app';

const app = buildTestApp();

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.invoice.seed([
        {
            id: 'inv_1',
            companyId: 'company_1',
            publicToken: 'pay-token-123',
            invoiceNumber: 'INV-1001',
            status: 'SENT',
            total: 1200,
            balance: 1200,
        },
    ]);
});

describe('GET /public/payments/invoices/:token (public pay page)', () => {
    it('returns the invoice for a valid public token', async () => {
        const res = await request(app).get('/public/payments/invoices/pay-token-123');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.invoice.invoiceNumber).toBe('INV-1001');
    });

    it('returns 404 for an unknown token', async () => {
        const res = await request(app).get('/public/payments/invoices/does-not-exist');
        expect(res.status).toBe(404);
    });
});
