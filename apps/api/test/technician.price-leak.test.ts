import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Technicians must never receive prices or costs from the API. Each route below
// either refuses a TECHNICIAN outright or returns a price-free body, while office
// roles keep their full view.

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});
vi.mock('../src/services/socket.service', () => ({
    socketService: { emitToCompany: vi.fn(), emitToUser: vi.fn() },
}));
const generateAndSend = vi.fn(async () => ({ pdfUrl: 'https://files.test/priced-summary.pdf', bytes: 1234 }));
vi.mock('../src/modules/jobs/summary-pdf.service', () => ({
    jobSummaryService: { generateAndSend: (...args: unknown[]) => (generateAndSend as any)(...args) },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { financeRouter } from '../src/routes/finance';
import { creditNotesRouter } from '../src/routes/creditNotes';
import { statementsRouter } from '../src/routes/statements';
import { membershipRouter } from '../src/routes/memberships';
import { financingRouter } from '../src/routes/financing';
import { operationsRouter } from '../src/routes/operations';
import { priceBookRouter } from '../src/routes/priceBook';
import { companyRouter } from '../src/routes/company';
import { portalRouter } from '../src/routes/portal';
import { jobRouter } from '../src/routes/jobs';

// Mounted exactly as in src/server.ts.
function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/company', companyRouter);
    app.use('/jobs', jobRouter);
    app.use('/finance', financeRouter);
    app.use('/operations', operationsRouter);
    app.use('/price-book', priceBookRouter);
    app.use('/portal', portalRouter);
    app.use('/memberships', membershipRouter);
    app.use('/financing', financingRouter);
    app.use('/credit-notes', creditNotesRouter);
    app.use('/statements', statementsRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH_ID = 'tech_1';
const PB_ID = '6f1c2a4e-3b5d-4c7e-9f00-1a2b3c4d5e6f';
const tech = authHeader({ role: 'TECHNICIAN', userId: TECH_ID });
const office = authHeader({ role: 'OFFICE' });
const admin = authHeader({ role: 'ADMIN' });

const MONEY_KEYS = [
    'unitPrice', 'costPrice', 'unitCost', 'total', 'subtotal', 'tax', 'balance',
    'merchantKey', 'passphrase', 'eftDetails', 'commission', 'billing',
];

// Walks a JSON body and returns every money/secret key it finds.
function findMoneyKeys(value: unknown, path = ''): string[] {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap((v, i) => findMoneyKeys(v, `${path}[${i}]`));
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
        ...(MONEY_KEYS.includes(k) ? [`${path}.${k}`] : []),
        ...findMoneyKeys(v, `${path}.${k}`),
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    generateAndSend.mockClear();
    fakePrisma.company.seed([
        {
            id: COMPANY,
            name: 'Mthembu Plumbing',
            settings: {
                fieldQuoting: { enabled: true },
                contact: { phone: '0110000000' },
                billing: {
                    eftDetails: { accountNumber: '123456789' },
                    payFast: { merchantId: 'm1', merchantKey: 'secret-key', passphrase: 'secret-pass' },
                },
                commission: { enabled: true, type: 'percentage', percentageRate: 10 },
            },
        },
    ]);
    fakePrisma.customer.seed([{ id: 'cust_1', companyId: COMPANY, name: 'Acme', email: 'a@acme.test' }]);
    fakePrisma.job.seed([
        { id: 'job_1', companyId: COMPANY, customerId: 'cust_1', techId: TECH_ID, vanId: null, title: 'Burst geyser' },
        { id: 'job_other', companyId: COMPANY, customerId: 'cust_1', techId: 'tech_2', vanId: null, title: 'Leak' },
    ]);
    fakePrisma.estimate.seed([{ id: 'est_1', companyId: COMPANY, customerId: 'cust_1', total: 900, items: [] }]);
    fakePrisma.invoice.seed([
        { id: 'inv_1', companyId: COMPANY, customerId: 'cust_1', subtotal: 100, tax: 15, total: 115, balance: 115 },
    ]);
    fakePrisma.priceBookItem.seed([
        { id: PB_ID, companyId: COMPANY, name: 'Geyser valve', unitPrice: 450, costPrice: 210, active: true, type: 'SERVICE' },
    ]);
    fakePrisma.inventoryItem.seed([
        { id: 'inv_item_1', companyId: COMPANY, name: 'Valve', quantity: 4, minLevel: 1, unitCost: 210, location: 'VAN', vanId: null, assignedUserId: TECH_ID },
    ]);
});

describe('finance reads are refused for technicians', () => {
    const routes = [
        '/finance/estimates',
        '/finance/estimates/est_1',
        '/finance/estimates/est_1/options',
        '/finance/invoices',
        '/finance/invoices/overdue',
        '/finance/invoices/inv_1',
    ];

    it.each(routes)('GET %s -> 403 for TECHNICIAN', async (route) => {
        const res = await request(app).get(route).set('Authorization', tech);
        expect(res.status).toBe(403);
    });

    it('office still lists estimates and invoices with totals', async () => {
        const est = await request(app).get('/finance/estimates').set('Authorization', office);
        expect(est.status).toBe(200);
        expect(est.body.data.estimates[0].total).toBe(900);

        const inv = await request(app).get('/finance/invoices').set('Authorization', office);
        expect(inv.status).toBe(200);
        expect(JSON.stringify(inv.body)).toContain('"balance":115');
    });
});

describe('office-only money modules are refused for technicians', () => {
    const routes = [
        '/credit-notes',
        '/credit-notes/cn_1',
        '/statements',
        '/memberships',
        '/memberships/m_1',
        '/memberships/tiers',
        '/memberships/tiers/t_1',
        '/memberships/customer/cust_1',
        '/memberships/customer/cust_1/discount',
        '/financing/options',
        '/operations/jobs/job_1/expenses',
        '/jobs',
    ];

    it.each(routes)('GET %s -> 403 for TECHNICIAN', async (route) => {
        const res = await request(app).get(route).set('Authorization', tech);
        expect(res.status).toBe(403);
    });

    it('technicians cannot generate a customer portal link', async () => {
        const res = await request(app).post('/portal/customers/cust_1/portal-link').set('Authorization', tech);
        expect(res.status).toBe(403);
    });
});

describe('price book', () => {
    it('strips unitPrice and costPrice for technicians', async () => {
        const list = await request(app).get('/price-book').set('Authorization', tech);
        expect(list.status).toBe(200);
        expect(list.body.data.items[0].name).toBe('Geyser valve');
        expect(findMoneyKeys(list.body)).toEqual([]);

        const one = await request(app).get('/price-book/' + PB_ID).set('Authorization', tech);
        expect(one.status).toBe(200);
        expect(findMoneyKeys(one.body)).toEqual([]);
    });

    it('office sees prices and costs', async () => {
        const res = await request(app).get('/price-book').set('Authorization', office);
        expect(res.body.data.items[0].unitPrice).toBe(450);
        expect(res.body.data.items[0].costPrice).toBe(210);
    });
});

describe('inventory', () => {
    it('strips unitCost for technicians, office keeps it', async () => {
        const t = await request(app).get('/operations/inventory').set('Authorization', tech);
        expect(t.status).toBe(200);
        expect(t.body.data.items[0].quantity).toBe(4);
        expect(findMoneyKeys(t.body)).toEqual([]);

        const o = await request(app).get('/operations/inventory').set('Authorization', office);
        expect(o.body.data.items[0].unitCost).toBe(210);
    });

    it('technicians may adjust a van count, and get no cost back', async () => {
        const res = await request(app)
            .patch('/operations/inventory/inv_item_1')
            .set('Authorization', tech)
            .send({ quantity: 3 });
        expect(res.status).toBe(200);
        expect(res.body.data.item.quantity).toBe(3);
        expect(findMoneyKeys(res.body)).toEqual([]);
    });

    it('technicians cannot edit cost or other metadata', async () => {
        const res = await request(app)
            .patch('/operations/inventory/inv_item_1')
            .set('Authorization', tech)
            .send({ unitCost: 1, minLevel: 0 });
        expect(res.status).toBe(403);
        const row = await fakePrisma.inventoryItem.findFirst({ where: { id: 'inv_item_1' } });
        expect(row.unitCost).toBe(210);
    });

    it('office can still edit metadata', async () => {
        const res = await request(app)
            .patch('/operations/inventory/inv_item_1')
            .set('Authorization', office)
            .send({ unitCost: 199 });
        expect(res.status).toBe(200);
        expect(res.body.data.item.unitCost).toBe(199);
    });
});

describe('job line items', () => {
    it('a technician adding a price-book item gets no price back', async () => {
        const res = await request(app)
            .post('/jobs/job_1/line-items')
            .set('Authorization', tech)
            .send({ name: 'Geyser valve', quantity: 2, priceBookItemId: PB_ID, unitPrice: 0, type: 'SERVICE' });
        expect(res.status).toBe(201);
        expect(res.body.data.item.name).toBe('Geyser valve');
        expect(res.body.data.item.quantity).toBe(2);
        expect(findMoneyKeys(res.body)).toEqual([]);
    });

    it('office gets the server-priced line back', async () => {
        const res = await request(app)
            .post('/jobs/job_1/line-items')
            .set('Authorization', office)
            .send({ name: 'Geyser valve', quantity: 2, priceBookItemId: PB_ID, unitPrice: 0, type: 'SERVICE' });
        expect(res.status).toBe(201);
        expect(res.body.data.item.unitPrice).toBe(450);
        expect(res.body.data.item.total).toBe(900);
    });
});

describe('job summary PDF', () => {
    it('a technician can send the summary for their job but never gets the priced PDF link', async () => {
        const res = await request(app)
            .post('/jobs/job_1/summary-pdf')
            .set('Authorization', tech)
            .send({ email: false, whatsapp: false });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ sent: true });
        expect(JSON.stringify(res.body)).not.toContain('priced-summary.pdf');
        // Forced to a customer send; no download-only mode for techs.
        expect(generateAndSend).toHaveBeenCalledWith('job_1', COMPANY, { email: true, whatsapp: true });
    });

    it("a technician cannot send another tech's summary", async () => {
        const res = await request(app).post('/jobs/job_other/summary-pdf').set('Authorization', tech).send({});
        expect(res.status).toBe(403);
        expect(generateAndSend).not.toHaveBeenCalled();
    });

    it('office still gets the PDF link', async () => {
        const res = await request(app).post('/jobs/job_1/summary-pdf').set('Authorization', office).send({ email: true });
        expect(res.status).toBe(200);
        expect(res.body.data.pdfUrl).toBe('https://files.test/priced-summary.pdf');
    });
});

describe('GET /company/me', () => {
    it('technicians get a reduced object with the field flags only', async () => {
        const res = await request(app).get('/company/me').set('Authorization', tech);
        expect(res.status).toBe(200);
        const company = res.body.data.company;
        expect(company.name).toBe('Mthembu Plumbing');
        expect(company.settings.fieldQuoting.enabled).toBe(true);
        expect(company.settings.contact.phone).toBe('0110000000');
        expect(findMoneyKeys(res.body)).toEqual([]);
        expect(JSON.stringify(res.body)).not.toContain('secret');
        expect(JSON.stringify(res.body)).not.toContain('123456789');
    });

    it('non-admin office roles get settings without the PayFast secrets', async () => {
        const res = await request(app).get('/company/me').set('Authorization', office);
        const payFast = res.body.data.company.settings.billing.payFast;
        expect(payFast.merchantId).toBe('m1');
        expect(payFast.merchantKey).toBeNull();
        expect(payFast.passphrase).toBeNull();
        expect(res.body.data.company.settings.billing.eftDetails.accountNumber).toBe('123456789');
    });

    it('admin still sees the secrets it edits', async () => {
        const res = await request(app).get('/company/me').set('Authorization', admin);
        const payFast = res.body.data.company.settings.billing.payFast;
        expect(payFast.merchantKey).toBe('secret-key');
        expect(payFast.passphrase).toBe('secret-pass');
    });

    it('non-admins cannot write settings', async () => {
        const res = await request(app)
            .patch('/company/me')
            .set('Authorization', office)
            .send({ settings: { billing: { payFast: { merchantKey: '' } } } });
        expect(res.status).toBe(403);
    });
});
