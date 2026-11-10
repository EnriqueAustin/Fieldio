import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Replace the real database with the shared in-memory fake before any router
// (and its service layer) is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { invoiceService } from '../src/modules/invoices/invoices.service';

const app = buildTestApp();
const COMPANY = 'company_1';

// supertest doesn't buffer binary (application/pdf) bodies by default.
function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
}

const vatSettings = {
    billing: {
        taxNumber: '4123456789',
        taxRate: 15,
        taxLabel: 'VAT',
        companyRegistrationNumber: '2016/123456/07',
        paymentMethods: { eftEnabled: true },
        eftDetails: { bankName: 'FNB', accountName: 'Mthembu Plumbing', accountNumber: '62000000000', branchCode: '250655' },
    },
    contact: { phone: '011 555 0100', email: 'accounts@mthembu.co.za' },
    regional: { currency: 'ZAR', locale: 'en-ZA', timezone: 'Africa/Johannesburg' },
};

// Seed a company counter + a completed job ready to invoice.
function seedCompany(sequence: number, settings: Record<string, any> = vatSettings) {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', invoiceSequence: sequence, settings }]);
}

function seedJob(id: string, lineItems: any[], settings: Record<string, any> = vatSettings, customer: Record<string, any> = {}) {
    fakePrisma.job.seed([
        {
            id,
            companyId: COMPANY,
            customerId: 'cust_1',
            projectId: null,
            status: 'COMPLETED',
            lineItems,
            company: { id: COMPANY, name: 'Mthembu Plumbing', settings },
            customer: { id: 'cust_1', name: 'Thandi Nkosi', ...customer },
            property: { addressLine1: '12 Jacaranda St', city: 'Pretoria', state: 'GP', zip: '0181' },
            invoice: null,
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
});

describe('invoice numbering — atomic, consecutive', () => {
    it('two invoices in a row get consecutive numbers continuing the backfilled sequence', async () => {
        seedCompany(1039);
        seedJob('job_a', [{ name: 'Labor', quantity: 1, unitPrice: 100, total: 100 }]);
        seedJob('job_b', [{ name: 'Pipe', quantity: 1, unitPrice: 200, total: 200 }]);

        const first = await invoiceService.createFromJob('job_a', COMPANY);
        const second = await invoiceService.createFromJob('job_b', COMPANY);

        expect(first.invoiceNumber).toBe('INV-01040');
        expect(second.invoiceNumber).toBe('INV-01041');
        // The counter on the company advanced by exactly two.
        expect(fakePrisma.company.rows[0].invoiceSequence).toBe(1041);
    });

    it('uses billing.invoicePrefix when present', async () => {
        seedCompany(0, { ...vatSettings, billing: { ...vatSettings.billing, invoicePrefix: 'MTH' } });
        seedJob('job_a', [{ name: 'Labor', quantity: 1, unitPrice: 100, total: 100 }], {
            ...vatSettings,
            billing: { ...vatSettings.billing, invoicePrefix: 'MTH' },
        });
        const inv = await invoiceService.createFromJob('job_a', COMPANY);
        expect(inv.invoiceNumber).toBe('MTH-00001');
    });
});

describe('VAT math — rounded to cents', () => {
    it('rounds tax to the cent (333.33 @ 15% → 50.00, total 383.33)', async () => {
        seedCompany(0);
        seedJob('job_a', [{ name: 'Callout', quantity: 1, unitPrice: 333.33, total: 333.33 }]);

        const inv = await invoiceService.createFromJob('job_a', COMPANY);
        expect(Number(inv.subtotal)).toBe(333.33);
        expect(Number(inv.tax)).toBe(50);
        expect(Number(inv.total)).toBe(383.33);
        expect(Number(inv.balance)).toBe(383.33);
        expect(Number(inv.taxRate)).toBe(15);
    });

    it('charges no VAT and stores rate 0 when the supplier has no VAT number', async () => {
        const noVat = { ...vatSettings, billing: { ...vatSettings.billing, taxNumber: '' } };
        seedCompany(0, noVat);
        seedJob('job_a', [{ name: 'Callout', quantity: 1, unitPrice: 333.33, total: 333.33 }], noVat);

        const inv = await invoiceService.createFromJob('job_a', COMPANY);
        expect(Number(inv.tax)).toBe(0);
        expect(Number(inv.taxRate)).toBe(0);
        expect(Number(inv.total)).toBe(333.33);
    });
});

describe('buyer snapshot at creation', () => {
    it('freezes the customer name, VAT number and billing address', async () => {
        seedCompany(0);
        seedJob('job_a', [{ name: 'Labor', quantity: 1, unitPrice: 100, total: 100 }], vatSettings, {
            vatNumber: '4999888777',
            billingAddress: 'PO Box 42, Sandton, 2196',
        });
        const inv = await invoiceService.createFromJob('job_a', COMPANY);
        expect(inv.customerName).toBe('Thandi Nkosi');
        expect(inv.customerVatNumber).toBe('4999888777');
        expect(inv.customerAddress).toBe('PO Box 42, Sandton, 2196');
    });

    it('falls back to the job property address when no billing address is set', async () => {
        seedCompany(0);
        seedJob('job_a', [{ name: 'Labor', quantity: 1, unitPrice: 100, total: 100 }]);
        const inv = await invoiceService.createFromJob('job_a', COMPANY);
        expect(inv.customerAddress).toBe('12 Jacaranda St, Pretoria, GP, 0181');
    });
});

// Seed a stored invoice row for the detail / PDF / void endpoints.
function seedInvoice(overrides: Record<string, any> = {}) {
    fakePrisma.invoice.seed([
        {
            id: 'inv_1',
            companyId: COMPANY,
            jobId: 'job_1',
            projectId: null,
            invoiceNumber: 'INV-01040',
            status: 'SENT',
            items: [{ name: 'Labor', quantity: 1, unitPrice: 100, total: 100 }],
            subtotal: 100,
            tax: 15,
            total: 115,
            balance: 115,
            taxLabel: 'VAT',
            taxRate: 15,
            taxNumber: '4123456789',
            supplierName: 'Mthembu Plumbing',
            supplierCompanyRegistration: '2016/123456/07',
            customerName: 'Thandi Nkosi',
            customerVatNumber: null,
            customerAddress: '12 Jacaranda St, Pretoria',
            paymentReference: 'INV-01040',
            publicToken: 'pay-token-1',
            dueDate: new Date('2026-07-21T00:00:00.000Z'),
            paidAt: null,
            voidedAt: null,
            voidReason: null,
            company: { id: COMPANY, name: 'Mthembu Plumbing', settings: vatSettings },
            job: { id: 'job_1', title: 'Replace geyser element', customer: { id: 'cust_1', name: 'Thandi Nkosi' } },
            payments: [],
            ...overrides,
        },
    ]);
}

describe('GET /finance/invoices/:id — heading rule', () => {
    it('reads "Tax Invoice" for a VAT-registered supplier', async () => {
        seedInvoice();
        const res = await request(app)
            .get('/finance/invoices/inv_1')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.invoice.heading).toBe('Tax Invoice');
        expect(res.body.data.invoice.payLink.hasToken).toBe(true);
        expect(res.body.data.invoice.customerAddress).toBe('12 Jacaranda St, Pretoria');
    });

    it('reads "Invoice" (never "Tax Invoice") when the supplier has no VAT number', async () => {
        seedInvoice({ taxNumber: null, taxRate: 0, tax: 0 });
        const res = await request(app)
            .get('/finance/invoices/inv_1')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        expect(res.body.data.invoice.heading).toBe('Invoice');
    });
});

describe('GET /finance/invoices/:id/pdf', () => {
    it('returns a PDF to office roles', async () => {
        seedInvoice();
        const res = await request(app)
            .get('/finance/invoices/inv_1/pdf')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .buffer()
            .parse(binaryParser as any);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.headers['content-disposition']).toContain('INV-01040.pdf');
        expect(res.body.slice(0, 4).toString('latin1')).toBe('%PDF');
    });

    it('refuses a TECHNICIAN', async () => {
        seedInvoice();
        const res = await request(app)
            .get('/finance/invoices/inv_1/pdf')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});

describe('GET /public/payments/invoices/:token/pdf', () => {
    it('serves the PDF by pay-link token', async () => {
        seedInvoice();
        const res = await request(app)
            .get('/public/payments/invoices/pay-token-1/pdf')
            .buffer()
            .parse(binaryParser as any);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.body.slice(0, 4).toString('latin1')).toBe('%PDF');
    });

    it('404s for an unknown token', async () => {
        seedInvoice();
        const res = await request(app).get('/public/payments/invoices/nope/pdf');
        expect(res.status).toBe(404);
    });
});

describe('POST /finance/invoices/:id/void', () => {
    it('refuses when a SUCCEEDED payment exists', async () => {
        seedInvoice();
        fakePrisma.payment.seed([
            { id: 'pay_1', companyId: COMPANY, invoiceId: 'inv_1', amount: 115, method: 'EFT', status: 'SUCCEEDED' },
        ]);
        const res = await request(app)
            .post('/finance/invoices/inv_1/void')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ reason: 'Issued in error' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/refund or credit/i);
        expect(fakePrisma.invoice.rows[0].status).toBe('SENT');
    });

    it('voids an unpaid invoice, zeroes the balance and clears the pay link', async () => {
        seedInvoice();
        const res = await request(app)
            .post('/finance/invoices/inv_1/void')
            .set('Authorization', authHeader({ role: 'ACCOUNTANT' }))
            .send({ reason: 'Duplicate of INV-01039' });
        expect(res.status).toBe(200);

        const row = fakePrisma.invoice.rows[0];
        expect(row.status).toBe('VOID');
        expect(Number(row.balance)).toBe(0);
        expect(row.voidReason).toBe('Duplicate of INV-01039');
        expect(row.voidedAt).toBeInstanceOf(Date);
        expect(row.publicToken).toBeNull();
        // Number is kept (never reused).
        expect(row.invoiceNumber).toBe('INV-01040');
    });

    it('rejects a void with a too-short reason', async () => {
        seedInvoice();
        const res = await request(app)
            .post('/finance/invoices/inv_1/void')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ reason: 'x' });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });

    it('refuses a TECHNICIAN', async () => {
        seedInvoice();
        const res = await request(app)
            .post('/finance/invoices/inv_1/void')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }))
            .send({ reason: 'Issued in error' });
        expect(res.status).toBe(403);
    });
});
