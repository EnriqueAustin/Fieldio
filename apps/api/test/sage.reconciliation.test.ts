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

const D = (s: string) => new Date(s);

beforeEach(() => {
    fakePrisma.$reset();
});

describe('GET /finance/export/sage/invoices — export tracking', () => {
    it('stamps exportedAt + a shared exportBatchId on every exported invoice', async () => {
        fakePrisma.invoice.seed([
            {
                id: 'inv_1', companyId: COMPANY, jobId: 'job_1', invoiceNumber: 'INV-00001',
                status: 'SENT', subtotal: 100, tax: 15, total: 115, balance: 115,
                taxRate: 15, taxLabel: 'VAT', createdAt: D('2026-07-01'), updatedAt: D('2026-07-01'),
                exportedAt: null, exportBatchId: null,
                job: { title: 'Fix geyser', customer: { name: 'Acme' } },
            },
            {
                id: 'inv_2', companyId: COMPANY, jobId: 'job_2', invoiceNumber: 'INV-00002',
                status: 'PAID', subtotal: 200, tax: 30, total: 230, balance: 0,
                taxRate: 15, taxLabel: 'VAT', createdAt: D('2026-07-02'), updatedAt: D('2026-07-02'),
                exportedAt: null, exportBatchId: null,
                job: { title: 'Unblock drain', customer: { name: 'Beta' } },
            },
        ]);

        const res = await request(app)
            .get('/finance/export/sage/invoices')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.text).toContain('INV-00001');
        expect(res.text).toContain('INV-00002');

        const inv1 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_1' } });
        const inv2 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_2' } });
        expect(inv1.exportedAt).toBeInstanceOf(Date);
        expect(inv2.exportedAt).toBeInstanceOf(Date);
        expect(inv1.exportBatchId).toBeTruthy();
        // Same export run → same batch id.
        expect(inv1.exportBatchId).toBe(inv2.exportBatchId);
    });

    it('supports re-export of a specific selection via ?ids=', async () => {
        fakePrisma.invoice.seed([
            {
                id: 'inv_1', companyId: COMPANY, jobId: 'job_1', invoiceNumber: 'INV-00001',
                status: 'SENT', subtotal: 100, tax: 15, total: 115, balance: 115,
                taxRate: 15, taxLabel: 'VAT', createdAt: D('2026-07-01'), updatedAt: D('2026-07-01'),
                job: { title: 'A', customer: { name: 'Acme' } },
            },
            {
                id: 'inv_2', companyId: COMPANY, jobId: 'job_2', invoiceNumber: 'INV-00002',
                status: 'SENT', subtotal: 200, tax: 30, total: 230, balance: 230,
                taxRate: 15, taxLabel: 'VAT', createdAt: D('2026-07-02'), updatedAt: D('2026-07-02'),
                exportedAt: null, exportBatchId: null,
                job: { title: 'B', customer: { name: 'Beta' } },
            },
        ]);

        const res = await request(app)
            .get('/finance/export/sage/invoices?ids=inv_1')
            .set('Authorization', authHeader({ role: 'ACCOUNTANT' }));

        expect(res.status).toBe(200);
        expect(res.text).toContain('INV-00001');
        expect(res.text).not.toContain('INV-00002');

        const inv2 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_2' } });
        expect(inv2.exportedAt).toBeNull();
    });
});

describe('GET /finance/export/sage/expenses — export tracking', () => {
    it('stamps exportedAt on exported expenses', async () => {
        fakePrisma.expense.seed([
            {
                id: 'exp_1', companyId: COMPANY, jobId: 'job_1', description: 'Copper pipe',
                amount: 120, category: 'MATERIALS', date: D('2026-07-03'),
                exportedAt: null, exportBatchId: null,
                job: { title: 'Fix geyser', customer: { name: 'Acme' } },
            },
        ]);

        const res = await request(app)
            .get('/finance/export/sage/expenses')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        const exp = await fakePrisma.expense.findFirst({ where: { id: 'exp_1' } });
        expect(exp.exportedAt).toBeInstanceOf(Date);
        expect(exp.exportBatchId).toBeTruthy();
    });
});

describe('GET /finance/export/sage/reconciliation', () => {
    it('buckets invoices into notExported / clean / modifiedSinceExport / paidAfterExport', async () => {
        const exported = D('2026-07-10T10:00:00Z');
        fakePrisma.invoice.seed([
            // Never exported.
            {
                id: 'inv_new', companyId: COMPANY, jobId: 'j1', invoiceNumber: 'INV-1',
                status: 'SENT', total: 100, balance: 100,
                createdAt: D('2026-07-09'), updatedAt: D('2026-07-09'),
                exportedAt: null, paidAt: null,
                job: { title: 'A', customer: { name: 'Acme' } },
            },
            // Exported, untouched since.
            {
                id: 'inv_clean', companyId: COMPANY, jobId: 'j2', invoiceNumber: 'INV-2',
                status: 'SENT', total: 200, balance: 200,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-08'),
                exportedAt: exported, paidAt: null,
                job: { title: 'B', customer: { name: 'Beta' } },
            },
            // Exported, then edited → needs re-export.
            {
                id: 'inv_mod', companyId: COMPANY, jobId: 'j3', invoiceNumber: 'INV-3',
                status: 'SENT', total: 300, balance: 300,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-12T09:00:00Z'),
                exportedAt: exported, paidAt: null,
                job: { title: 'C', customer: { name: 'Gamma' } },
            },
            // Exported, then paid → Sage AR is stale.
            {
                id: 'inv_paid', companyId: COMPANY, jobId: 'j4', invoiceNumber: 'INV-4',
                status: 'PAID', total: 400, balance: 0,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-11T08:00:00Z'),
                exportedAt: exported, paidAt: D('2026-07-11T08:00:00Z'),
                job: { title: 'D', customer: { name: 'Delta' } },
            },
            // DRAFT/VOID are excluded from reconciliation entirely.
            {
                id: 'inv_draft', companyId: COMPANY, jobId: 'j5', invoiceNumber: 'INV-5',
                status: 'DRAFT', total: 500, balance: 500,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-08'),
                exportedAt: null, paidAt: null,
                job: { title: 'E', customer: { name: 'Echo' } },
            },
        ]);

        const res = await request(app)
            .get('/finance/export/sage/reconciliation')
            .set('Authorization', authHeader({ role: 'ACCOUNTANT' }));

        expect(res.status).toBe(200);
        const d = res.body.data;
        expect(d.summary).toEqual({
            total: 4,
            notExported: 1,
            clean: 1,
            modifiedSinceExport: 1,
            paidAfterExport: 1,
        });
        expect(d.notExported[0].id).toBe('inv_new');
        expect(d.clean[0].id).toBe('inv_clean');
        expect(d.modifiedSinceExport[0].id).toBe('inv_mod');
        expect(d.paidAfterExport[0].id).toBe('inv_paid');
    });

    it('rejects TECHNICIAN', async () => {
        const res = await request(app)
            .get('/finance/export/sage/reconciliation')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});

describe('POST /finance/export/sage/reconcile', () => {
    it('stamps reconciledAt on the selected invoices (company-scoped)', async () => {
        fakePrisma.invoice.seed([
            {
                id: 'inv_1', companyId: COMPANY, jobId: 'j1', status: 'PAID',
                total: 100, balance: 0, reconciledAt: null,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-08'),
            },
            {
                id: 'inv_other', companyId: 'other_co', jobId: 'j2', status: 'PAID',
                total: 100, balance: 0, reconciledAt: null,
                createdAt: D('2026-07-08'), updatedAt: D('2026-07-08'),
            },
        ]);

        const res = await request(app)
            .post('/finance/export/sage/reconcile')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ids: ['inv_1', 'inv_other'] });

        expect(res.status).toBe(200);
        expect(res.body.data.reconciled).toBe(1);

        const inv1 = await fakePrisma.invoice.findFirst({ where: { id: 'inv_1' } });
        expect(inv1.reconciledAt).toBeInstanceOf(Date);
        const other = await fakePrisma.invoice.findFirst({ where: { id: 'inv_other' } });
        expect(other.reconciledAt).toBeNull();
    });

    it('rejects an empty ids payload', async () => {
        const res = await request(app)
            .post('/finance/export/sage/reconcile')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ ids: [] });
        expect(res.status).toBe(400);
    });
});
