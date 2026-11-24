import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Swap in the in-memory fake before any router/service is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { creditNotesRouter } from '../src/routes/creditNotes';
import { statementsRouter } from '../src/routes/statements';

// Minimal app mounting just the two routers under test (the shared buildTestApp
// does not include them), mirroring server.ts's mount paths.
function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/credit-notes', creditNotesRouter);
    app.use('/statements', statementsRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const office = () => authHeader({ role: 'OFFICE', companyId: COMPANY });
const tech = () => authHeader({ role: 'TECHNICIAN', companyId: COMPANY });

beforeEach(() => fakePrisma.$reset());

describe('POST /credit-notes — create', () => {
    it('creates a DRAFT with explicit VAT, frozen line totals and a CN number', async () => {
        const res = await request(app)
            .post('/credit-notes')
            .set('Authorization', office())
            .send({
                customerId: 'cust_1',
                taxRate: 15,
                items: [{ name: 'Refund call-out', quantity: 2, unitPrice: 500 }],
            });

        expect(res.status).toBe(201);
        const note = res.body.data.note;
        expect(note.status).toBe('DRAFT');
        expect(note.number).toBe('CN-00001');
        expect(Number(note.subtotal)).toBe(1000);
        expect(Number(note.tax)).toBe(150);
        expect(Number(note.total)).toBe(1150);
        expect(note.items[0].total).toBe(1000); // qty*unit frozen onto the line
    });

    it('falls back to no VAT when the supplier has no VAT number', async () => {
        const res = await request(app)
            .post('/credit-notes')
            .set('Authorization', office())
            .send({ customerId: 'cust_1', items: [{ name: 'Goodwill credit', quantity: 1, unitPrice: 400 }] });

        expect(res.status).toBe(201);
        expect(Number(res.body.data.note.tax)).toBe(0);
        expect(Number(res.body.data.note.total)).toBe(400);
    });

    it('continues the per-company CN sequence', async () => {
        fakePrisma.creditNote.seed([
            { id: 'cn_old', companyId: COMPANY, customerId: 'cust_1', number: 'CN-00007', status: 'DRAFT', total: 10 },
        ]);
        const res = await request(app)
            .post('/credit-notes')
            .set('Authorization', office())
            .send({ customerId: 'cust_1', taxRate: 0, items: [{ name: 'x', quantity: 1, unitPrice: 5 }] });
        expect(res.body.data.note.number).toBe('CN-00008');
    });

    it('rejects a note with no line items', async () => {
        const res = await request(app)
            .post('/credit-notes')
            .set('Authorization', office())
            .send({ customerId: 'cust_1', items: [] });
        expect(res.status).toBe(400);
    });

    it('is forbidden for technicians', async () => {
        const res = await request(app)
            .post('/credit-notes')
            .set('Authorization', tech())
            .send({ customerId: 'cust_1', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] });
        expect(res.status).toBe(403);
    });
});

describe('GET /credit-notes — list is company-scoped', () => {
    it('returns only this company’s notes', async () => {
        fakePrisma.creditNote.seed([
            { id: 'a', companyId: COMPANY, customerId: 'c', number: 'CN-00001', status: 'DRAFT', total: 100, customer: { id: 'c', name: 'Mine' }, invoice: null },
            { id: 'b', companyId: 'other', customerId: 'c2', number: 'CN-00001', status: 'DRAFT', total: 200, customer: { id: 'c2', name: 'Theirs' }, invoice: null },
        ]);
        const res = await request(app).get('/credit-notes').set('Authorization', office());
        expect(res.status).toBe(200);
        expect(res.body.data.notes).toHaveLength(1);
        expect(res.body.data.notes[0].id).toBe('a');
    });
});

describe('POST /credit-notes/:id/apply — offsets the invoice', () => {
    it('reduces the invoice balance by the credit total', async () => {
        fakePrisma.invoice.seed([
            { id: 'inv_1', companyId: COMPANY, jobId: 'j1', status: 'SENT', balance: 1000, total: 1000 },
        ]);
        fakePrisma.creditNote.seed([
            { id: 'cn_1', companyId: COMPANY, customerId: 'c', invoiceId: 'inv_1', number: 'CN-00001', status: 'ISSUED', total: 400 },
        ]);

        const res = await request(app).post('/credit-notes/cn_1/apply').set('Authorization', office());
        expect(res.status).toBe(200);
        expect(res.body.data.note.status).toBe('APPLIED');

        const inv = fakePrisma.invoice.rows.find((r: any) => r.id === 'inv_1');
        expect(Number(inv.balance)).toBe(600);
        expect(inv.status).toBe('SENT');
    });

    it('marks the invoice PAID when the credit covers the balance', async () => {
        fakePrisma.invoice.seed([
            { id: 'inv_2', companyId: COMPANY, jobId: 'j2', status: 'SENT', balance: 500, total: 500 },
        ]);
        fakePrisma.creditNote.seed([
            { id: 'cn_2', companyId: COMPANY, customerId: 'c', invoiceId: 'inv_2', number: 'CN-00002', status: 'ISSUED', total: 500 },
        ]);
        await request(app).post('/credit-notes/cn_2/apply').set('Authorization', office());
        const inv = fakePrisma.invoice.rows.find((r: any) => r.id === 'inv_2');
        expect(Number(inv.balance)).toBe(0);
        expect(inv.status).toBe('PAID');
    });
});

describe('GET /statements/:id — printable detail', () => {
    it('returns the stored summary plus recomputed line detail', async () => {
        fakePrisma.customer.seed([{ id: 'cust_1', companyId: COMPANY, name: 'Mthembu', email: 'm@x.co' }]);
        fakePrisma.customerStatement.seed([
            {
                id: 'st_1',
                companyId: COMPANY,
                customerId: 'cust_1',
                periodStart: new Date('2026-07-01'),
                periodEnd: new Date('2026-07-31'),
                openingBalance: 0,
                invoicedTotal: 1150,
                paymentsTotal: 0,
                creditsTotal: 0,
                closingBalance: 1150,
                customer: { id: 'cust_1', name: 'Mthembu', email: 'm@x.co' },
            },
        ]);
        fakePrisma.invoice.seed([
            { id: 'inv_1', companyId: COMPANY, jobId: 'j1', status: 'SENT', total: 1150, balance: 1150, invoiceNumber: 'INV-00001', createdAt: new Date('2026-07-10') },
        ]);

        const res = await request(app).get('/statements/st_1').set('Authorization', office());
        expect(res.status).toBe(200);
        expect(res.body.data.statement.id).toBe('st_1');
        expect(res.body.data.customer.name).toBe('Mthembu');
        expect(res.body.data.lines.invoices).toHaveLength(1);
        expect(Number(res.body.data.closingBalance)).toBe(1150);
    });
});

describe('GET /statements/outstanding-customers', () => {
    it('groups outstanding balances and excludes VOID/DRAFT/paid', async () => {
        fakePrisma.invoice.seed([
            { id: 'i1', companyId: COMPANY, jobId: 'j1', status: 'SENT', balance: 500, job: { customerId: 'cust_1', customer: { id: 'cust_1', name: 'Acme' } } },
            { id: 'i2', companyId: COMPANY, jobId: 'j2', status: 'OVERDUE', balance: 250, job: { customerId: 'cust_1', customer: { id: 'cust_1', name: 'Acme' } } },
            { id: 'i3', companyId: COMPANY, jobId: 'j3', status: 'PAID', balance: 0, job: { customerId: 'cust_2', customer: { id: 'cust_2', name: 'Beta' } } },
            { id: 'i4', companyId: COMPANY, jobId: 'j4', status: 'VOID', balance: 300, job: { customerId: 'cust_3', customer: { id: 'cust_3', name: 'Void Co' } } },
            { id: 'i5', companyId: COMPANY, jobId: 'j5', status: 'DRAFT', balance: 200, job: { customerId: 'cust_4', customer: { id: 'cust_4', name: 'Draft Co' } } },
            { id: 'i6', companyId: 'other', jobId: 'j6', status: 'SENT', balance: 999, job: { customerId: 'cust_9', customer: { id: 'cust_9', name: 'Other Co' } } },
        ]);

        const res = await request(app).get('/statements/outstanding-customers').set('Authorization', office());
        expect(res.status).toBe(200);
        const customers = res.body.data.customers;
        expect(customers).toHaveLength(1);
        expect(customers[0]).toMatchObject({ customerId: 'cust_1', name: 'Acme', balance: 750 });
    });

    it('is forbidden for technicians', async () => {
        const res = await request(app).get('/statements/outstanding-customers').set('Authorization', tech());
        expect(res.status).toBe(403);
    });
});
