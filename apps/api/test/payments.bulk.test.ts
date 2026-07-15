import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

// Replace the real database with the shared in-memory fake before any router
// (and its service layer) is imported.
import { vi } from 'vitest';
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';

// Seed a set of open invoices with distinct numbers/amounts. The fake Prisma
// returns rows as-is, so job/customer are embedded for the include shape.
function seedOpenInvoices() {
    fakePrisma.invoice.seed([
        {
            id: 'inv_1',
            companyId: COMPANY,
            jobId: 'job_1',
            invoiceNumber: 'INV-00001',
            paymentReference: 'INV-00001',
            status: 'SENT',
            total: 1150,
            balance: 1150,
            job: { customer: { name: 'Acme' } },
        },
        {
            id: 'inv_2',
            companyId: COMPANY,
            jobId: 'job_2',
            invoiceNumber: 'INV-00002',
            paymentReference: 'INV-00002',
            status: 'OVERDUE',
            total: 500,
            balance: 500,
            job: { customer: { name: 'Beta' } },
        },
        // Two invoices with the same outstanding balance → amount-only match is ambiguous.
        {
            id: 'inv_3',
            companyId: COMPANY,
            jobId: 'job_3',
            invoiceNumber: 'INV-00003',
            paymentReference: 'INV-00003',
            status: 'SENT',
            total: 750,
            balance: 750,
            job: { customer: { name: 'Gamma' } },
        },
        {
            id: 'inv_4',
            companyId: COMPANY,
            jobId: 'job_4',
            invoiceNumber: 'INV-00004',
            paymentReference: 'INV-00004',
            status: 'PARTIAL',
            total: 1000,
            balance: 750,
            job: { customer: { name: 'Delta' } },
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedOpenInvoices();
});

describe('POST /finance/payments/bulk-match', () => {
    it('matches a line by invoice number in the statement reference', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                lines: [{ date: '2026-07-14', amount: 1150, reference: 'FNB EFT INV-00001 ACME' }],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.matched).toHaveLength(1);
        expect(res.body.data.matched[0].invoice.id).toBe('inv_1');
        expect(res.body.data.matched[0].confidence).toBe('reference');
        expect(res.body.data.matched[0].amountMismatch).toBe(false);
        expect(res.body.data.ambiguous).toHaveLength(0);
        expect(res.body.data.unmatched).toHaveLength(0);
    });

    it('matches by exact outstanding amount when the reference is unrecognisable', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ lines: [{ amount: 500, reference: 'CASH DEP 998877' }] });

        expect(res.status).toBe(200);
        expect(res.body.data.matched).toHaveLength(1);
        expect(res.body.data.matched[0].invoice.id).toBe('inv_2');
        expect(res.body.data.matched[0].confidence).toBe('amount');
    });

    it('flags a line as ambiguous when several invoices share the amount', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ lines: [{ amount: 750, reference: 'EFT PAYMENT' }] });

        expect(res.status).toBe(200);
        expect(res.body.data.matched).toHaveLength(0);
        expect(res.body.data.ambiguous).toHaveLength(1);
        const candidateIds = res.body.data.ambiguous[0].candidates.map((c: any) => c.id);
        expect(candidateIds).toEqual(expect.arrayContaining(['inv_3', 'inv_4']));
    });

    it('reports a line as unmatched when nothing fits', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ lines: [{ amount: 42.42, reference: 'MYSTERY DEPOSIT' }] });

        expect(res.status).toBe(200);
        expect(res.body.data.matched).toHaveLength(0);
        expect(res.body.data.ambiguous).toHaveLength(0);
        expect(res.body.data.unmatched).toHaveLength(1);
        expect(res.body.data.unmatched[0].line.reference).toBe('MYSTERY DEPOSIT');
    });

    it('is a dry run: no payments are recorded and no invoices change', async () => {
        await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ lines: [{ amount: 1150, reference: 'INV-00001' }] });

        const payments = await fakePrisma.payment.findMany({});
        expect(payments).toHaveLength(0);
        const inv = await fakePrisma.invoice.findFirst({ where: { id: 'inv_1' } });
        expect(inv.status).toBe('SENT');
        expect(Number(inv.balance)).toBe(1150);
    });

    it('allows ACCOUNTANT but rejects TECHNICIAN', async () => {
        const ok = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'ACCOUNTANT' }))
            .send({ lines: [{ amount: 500 }] });
        expect(ok.status).toBe(200);

        const denied = await request(app)
            .post('/finance/payments/bulk-match')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ lines: [{ amount: 500 }] });
        expect(denied.status).toBe(403);
    });
});

describe('POST /finance/payments/bulk-record', () => {
    it('records confirmed matches and transitions invoices to PAID / PARTIAL', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({
                matches: [
                    { invoiceId: 'inv_1', amount: 1150 }, // full → PAID
                    { invoiceId: 'inv_2', amount: 200 },  // partial → PARTIAL
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.recorded).toBe(2);
        expect(res.body.data.failed).toBe(0);

        const inv1 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_1' } });
        expect(inv1.status).toBe('PAID');
        expect(Number(inv1.balance)).toBe(0);
        expect(inv1.paidAt).toBeTruthy();

        const inv2 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_2' } });
        expect(inv2.status).toBe('PARTIAL');
        expect(Number(inv2.balance)).toBe(300);

        // One EFT payment row per match.
        const payments = await fakePrisma.payment.findMany({ where: { companyId: COMPANY } });
        expect(payments).toHaveLength(2);
        expect(payments.every((p: any) => p.method === 'EFT' && p.status === 'SUCCEEDED')).toBe(true);
    });

    it('isolates failures: a bad row does not abort the rest of the batch', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({
                matches: [
                    { invoiceId: 'inv_missing', amount: 100 },
                    { invoiceId: 'inv_2', amount: 500 },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.recorded).toBe(1);
        expect(res.body.data.failed).toBe(1);
        const failure = res.body.data.results.find((r: any) => !r.ok);
        expect(failure.invoiceId).toBe('inv_missing');
        expect(failure.error).toMatch(/not found/i);

        const inv2 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_2' } });
        expect(inv2.status).toBe('PAID');
    });

    it('refuses to double-pay an already PAID invoice', async () => {
        await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ matches: [{ invoiceId: 'inv_1', amount: 1150 }] });

        const res = await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ matches: [{ invoiceId: 'inv_1', amount: 1150 }] });

        expect(res.status).toBe(200);
        expect(res.body.data.recorded).toBe(0);
        expect(res.body.data.results[0].error).toMatch(/already paid/i);

        const payments = await fakePrisma.payment.findMany({ where: { invoiceId: 'inv_1' } });
        expect(payments).toHaveLength(1);
    });

    it('scopes matching to the caller company (404 → per-row failure)', async () => {
        const res = await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'other_co' }))
            .send({ matches: [{ invoiceId: 'inv_1', amount: 1150 }] });

        expect(res.status).toBe(200);
        expect(res.body.data.recorded).toBe(0);
        expect(res.body.data.results[0].error).toMatch(/not found/i);
    });

    it('rejects TECHNICIAN and unauthenticated callers', async () => {
        const denied = await request(app)
            .post('/finance/payments/bulk-record')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ matches: [{ invoiceId: 'inv_1', amount: 1 }] });
        expect(denied.status).toBe(403);

        const anon = await request(app)
            .post('/finance/payments/bulk-record')
            .send({ matches: [{ invoiceId: 'inv_1', amount: 1 }] });
        expect(anon.status).toBe(401);
    });
});
