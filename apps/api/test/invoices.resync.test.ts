import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { invoiceService } from '../src/modules/invoices/invoices.service';

const app = buildTestApp();
const COMPANY = 'company_1';
const office = authHeader({ role: 'OFFICE', companyId: COMPANY, userId: 'office_1' });

const vatBilling = {
    taxNumber: '4123456789',
    taxRate: 15,
    taxLabel: 'VAT',
    paymentMethods: { eftEnabled: true },
};
const settingsFor = (billing: Record<string, unknown>) => ({
    billing,
    regional: { currency: 'ZAR', locale: 'en-ZA', timezone: 'Africa/Johannesburg' },
});

function seedJob(lineItems: any[], billing: Record<string, unknown> = vatBilling) {
    const settings = settingsFor(billing);
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', invoiceSequence: 41, settings }]);
    fakePrisma.job.seed([
        {
            id: 'job_1',
            companyId: COMPANY,
            customerId: 'cust_1',
            projectId: null,
            status: 'COMPLETED',
            lineItems,
            company: { id: COMPANY, name: 'Mthembu Plumbing', settings },
            customer: { id: 'cust_1', name: 'Thandi Nkosi' },
            property: null,
            invoice: null,
        },
    ]);
}

const setLineItems = (lineItems: any[]) => {
    fakePrisma.job.rows[0].lineItems = lineItems;
};

beforeEach(() => {
    fakePrisma.$reset();
});

describe('POST /finance/invoices/:id/resync-from-job', () => {
    it('rebuilds a DRAFT invoice from the job current line items, keeping the number', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);
        expect(Number(created.total)).toBe(115);

        // The office corrects the job after the draft was generated.
        setLineItems([
            { name: 'Callout', quantity: 1, unitPrice: 100, total: 100 },
            { name: 'Geyser element', quantity: 2, unitPrice: 333.33, total: 666.66 },
        ]);

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(200);
        const inv = res.body.data.invoice;
        expect(inv.invoiceNumber).toBe(created.invoiceNumber);
        expect(inv.status).toBe('DRAFT');
        expect(Number(inv.subtotal)).toBe(766.66);
        expect(Number(inv.tax)).toBe(115); // 766.66 * 15% = 114.999 -> 115.00
        expect(Number(inv.total)).toBe(881.66);
        expect(Number(inv.balance)).toBe(881.66);
        expect(inv.items).toHaveLength(2);

        // The number was not consumed again.
        expect(fakePrisma.company.rows[0].invoiceSequence).toBe(42);

        const audit = fakePrisma.auditLog.rows.find((r: any) => r.action === 'INVOICE_RESYNCED_FROM_JOB');
        expect(audit).toMatchObject({ companyId: COMPANY, userId: 'office_1', entityId: created.id, entityType: 'INVOICE' });
        expect(audit.metadata).toMatchObject({ previousTotal: 115, newTotal: 881.66 });
    });

    it('charges no VAT when the supplier has no VAT number (same rule as create)', async () => {
        const noVat = { ...vatBilling, taxNumber: '' };
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }], noVat);
        const created = await invoiceService.createFromJob('job_1', COMPANY);
        setLineItems([{ name: 'Callout', quantity: 1, unitPrice: 333.33, total: 333.33 }]);

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(200);
        expect(Number(res.body.data.invoice.tax)).toBe(0);
        expect(Number(res.body.data.invoice.taxRate)).toBe(0);
        expect(Number(res.body.data.invoice.total)).toBe(333.33);
    });

    it('matches createFromJob exactly (rounding to the cent)', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 333.33, total: 333.33 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(200);
        expect(Number(res.body.data.invoice.tax)).toBe(Number(created.tax));
        expect(Number(res.body.data.invoice.total)).toBe(Number(created.total));
    });

    it.each(['SENT', 'VOID', 'PAID'])('refuses a %s invoice with 409', async (status) => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);
        fakePrisma.invoice.rows[0].status = status;

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(409);
        expect(fakePrisma.auditLog.rows).toHaveLength(0);
    });

    it('refuses a DRAFT invoice that already has a payment (409)', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);
        fakePrisma.payment.seed([
            { id: 'pay_1', companyId: COMPANY, invoiceId: created.id, amount: 50, status: 'SUCCEEDED' },
        ]);
        setLineItems([{ name: 'Callout', quantity: 1, unitPrice: 999, total: 999 }]);

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(409);
        expect(Number(fakePrisma.invoice.rows[0].total)).toBe(115);
    });

    it('refuses a DRAFT invoice with an applied credit note (409)', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);
        fakePrisma.creditNote.seed([
            { id: 'cn_1', companyId: COMPANY, customerId: 'cust_1', invoiceId: created.id, status: 'APPLIED', total: 20 },
        ]);
        setLineItems([{ name: 'Callout', quantity: 1, unitPrice: 999, total: 999 }]);

        const res = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', office)
            .send({});

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/credit note/i);
        expect(Number(fakePrisma.invoice.rows[0].total)).toBe(115);
    });

    it('is 404 for another company invoice and 403 for a technician', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        const created = await invoiceService.createFromJob('job_1', COMPANY);

        const other = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'company_2', userId: 'o2' }))
            .send({});
        expect(other.status).toBe(404);

        const tech = await request(app)
            .post(`/finance/invoices/${created.id}/resync-from-job`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: 't1' }))
            .send({});
        expect(tech.status).toBe(403);
    });
});

describe('createFromJob on a job whose invoice was voided', () => {
    it('explains that re-invoicing a voided job is not supported yet', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        fakePrisma.job.rows[0].invoice = { id: 'inv_old', status: 'VOID' };

        await expect(invoiceService.createFromJob('job_1', COMPANY)).rejects.toThrow(
            /voided; re-invoicing a voided job isn't supported yet/
        );
    });

    it('still says "Job already invoiced" for a live invoice', async () => {
        seedJob([{ name: 'Callout', quantity: 1, unitPrice: 100, total: 100 }]);
        fakePrisma.job.rows[0].invoice = { id: 'inv_old', status: 'SENT' };

        await expect(invoiceService.createFromJob('job_1', COMPANY)).rejects.toThrow('Job already invoiced');
    });
});
