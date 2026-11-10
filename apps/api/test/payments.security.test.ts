import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { publicPaymentsRouter } from '../src/routes/payments';
import { errorHandler } from '../src/middleware/error';
import { payFastClient, paymentsService } from '../src/modules/payments/payments.service';

const PASSPHRASE = 'jt7NOE43FZPn';
const PAYFAST_IP = '197.97.145.144';

// Mirrors the real chain, plus a test-only hook to set the socket address
// (req.ip) — supertest always connects from loopback.
const app = express();
app.use((req, _res, next) => {
    const ip = req.headers['x-test-remote-ip'];
    if (typeof ip === 'string') Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    next();
});
app.use(express.json());
app.use('/public/payments', publicPaymentsRouter);
app.use(errorHandler);

const settings = (overrides: Record<string, any> = {}) => ({
    contact: { phone: '011 555 0100', email: 'accounts@mthembu.co.za' },
    commission: { enabled: true, type: 'percentage', percentageRate: 12 },
    billing: {
        taxNumber: '4123456789',
        paymentMethods: { cardEnabled: true, eftEnabled: true, payFastEnabled: true },
        eftDetails: { bankName: 'FNB', accountName: 'Mthembu Plumbing', accountNumber: '62000000000', branchCode: '250655' },
        payFast: { merchantId: '10000100', merchantKey: 'SECRET-MERCHANT-KEY', passphrase: PASSPHRASE, sandbox: true },
        ...overrides,
    },
});

const pfEncode = (v: string) => encodeURIComponent(v.trim()).replace(/%20/g, '+');

const signedItn = (fields: [string, string][], passphrase = PASSPHRASE) => {
    const paramString = fields.map(([k, v]) => `${k}=${pfEncode(v)}`).join('&');
    const signature = crypto.createHash('md5').update(`${paramString}&passphrase=${pfEncode(passphrase)}`).digest('hex');
    return `${paramString}&signature=${signature}`;
};

const itnFields = (amount = '1150.00', pfPaymentId = '1089250'): [string, string][] => [
    ['m_payment_id', 'pay_pending_1'],
    ['pf_payment_id', pfPaymentId],
    ['payment_status', 'COMPLETE'],
    ['item_name', 'INV-1001'],
    ['amount_gross', amount],
    ['amount_fee', '-26.45'],
    ['amount_net', '1123.55'],
    ['custom_str1', 'inv_1'],
    ['merchant_id', '10000100'],
];

const postItn = (payload: string, ip = PAYFAST_IP, extraHeaders: Record<string, string> = {}) =>
    request(app)
        .post('/public/payments/payfast/notify')
        .set('x-test-remote-ip', ip)
        .set(extraHeaders)
        .type('form')
        .send(payload);

let validate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fakePrisma.$reset();
    validate = vi.spyOn(payFastClient, 'validate').mockResolvedValue('VALID');
    fakePrisma.invoice.seed([
        {
            id: 'inv_1',
            companyId: 'company_1',
            publicToken: 'pay-token-123',
            invoiceNumber: 'INV-1001',
            paymentReference: 'INV-1001',
            status: 'SENT',
            subtotal: 1000,
            tax: 150,
            total: 1150,
            balance: 1150,
            paidAt: null,
            items: [{ name: 'Geyser element', quantity: 1, unitPrice: 1000, total: 1000, unitCost: 400 }],
            company: { id: 'company_1', name: 'Mthembu Plumbing', settings: settings() },
            job: {
                title: 'Replace geyser element',
                customer: { name: 'Thandi Nkosi', email: 'thandi@example.com' },
                property: { addressLine1: '12 Jacaranda St', city: 'Pretoria', state: 'GP', zip: '0181' },
            },
            payments: [],
        },
    ]);
    fakePrisma.payment.seed([
        {
            id: 'pay_pending_1',
            companyId: 'company_1',
            invoiceId: 'inv_1',
            amount: '1150.00',
            method: 'PAYFAST',
            status: 'PENDING',
            stripePaymentIntentId: null,
            metadata: { token: 'pay-token-123', amount: '1150.00' },
        },
    ]);
});

describe('GET /public/payments/invoices/:token — whitelisted payload', () => {
    it('never exposes gateway secrets or internal settings', async () => {
        const res = await request(app).get('/public/payments/invoices/pay-token-123');
        expect(res.status).toBe(200);
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain('SECRET-MERCHANT-KEY');
        expect(raw).not.toContain(PASSPHRASE);
        expect(raw).not.toContain('merchantKey');
        expect(raw).not.toContain('passphrase');
        expect(raw).not.toContain('commission');
        expect(raw).not.toContain('settings');
        expect(raw).not.toContain('unitCost');
        expect(raw).not.toContain('thandi@example.com');

        const inv = res.body.data.invoice;
        expect(inv.company.name).toBe('Mthembu Plumbing');
        expect(inv.company.vatNumber).toBe('4123456789');
        expect(inv.paymentOptions.payFast).toBe(true);
        // Stripe isn't configured in tests → card option is hidden.
        expect(inv.paymentOptions.card).toBe(false);
        expect(inv.paymentOptions.eft).toMatchObject({ bankName: 'FNB', accountNumber: '62000000000', reference: 'INV-1001' });
        expect(inv.balance).toBe(1150);
        expect(inv.customer).toEqual({ name: 'Thandi Nkosi' });
    });
});

describe('POST /public/payments/payfast/notify — ITN security', () => {
    it('ignores a spoofed X-Forwarded-For when req.ip is not PayFast', async () => {
        const res = await postItn(signedItn(itnFields()), '8.8.8.8', { 'X-Forwarded-For': PAYFAST_IP });
        expect(res.status).toBe(400);
        expect(validate).not.toHaveBeenCalled();
        expect(fakePrisma.invoice.rows[0].status).toBe('SENT');
    });

    it('rejects a bad signature', async () => {
        const res = await postItn(signedItn(itnFields(), 'wrong-passphrase'));
        expect(res.status).toBe(400);
        expect(fakePrisma.invoice.rows[0].balance).toBe(1150);
    });

    it('rejects when the company has no passphrase configured', async () => {
        fakePrisma.invoice.rows[0].company.settings = settings({
            payFast: { merchantId: '10000100', merchantKey: 'k', passphrase: null, sandbox: true },
        });
        const fields = itnFields();
        const paramString = fields.map(([k, v]) => `${k}=${pfEncode(v)}`).join('&');
        const unsigned = crypto.createHash('md5').update(paramString).digest('hex');
        const res = await postItn(`${paramString}&signature=${unsigned}`);
        expect(res.status).toBe(400);
        expect(fakePrisma.invoice.rows[0].status).toBe('SENT');
    });

    it('rejects an amount that does not match the pending payment to the cent', async () => {
        const res = await postItn(signedItn(itnFields('1149.99')));
        expect(res.status).toBe(400);
        expect(fakePrisma.invoice.rows[0].balance).toBe(1150);
        expect(fakePrisma.payment.rows[0].status).toBe('PENDING');
    });

    it('rejects when PayFast server validation returns INVALID', async () => {
        validate.mockResolvedValue('INVALID');
        const res = await postItn(signedItn(itnFields()));
        expect(res.status).toBe(400);
        expect(validate).toHaveBeenCalledTimes(1);
        expect(validate.mock.calls[0][1]).toBe(true); // sandbox host
        expect(fakePrisma.invoice.rows[0].status).toBe('SENT');
    });

    it('accepts a valid ITN, promotes the pending row and marks the invoice paid', async () => {
        const res = await postItn(signedItn(itnFields()));
        expect(res.status).toBe(200);
        expect(res.text).toBe('OK');

        const invoice = fakePrisma.invoice.rows[0];
        expect(invoice.status).toBe('PAID');
        expect(Number(invoice.balance)).toBe(0);
        expect(invoice.paidAt).toBeInstanceOf(Date);

        expect(fakePrisma.payment.rows).toHaveLength(1);
        const payment = fakePrisma.payment.rows[0];
        expect(payment.id).toBe('pay_pending_1');
        expect(payment.status).toBe('SUCCEEDED');
        expect(Number(payment.amount)).toBe(1150);
        expect(payment.stripePaymentIntentId).toBe('1089250');
    });

    it('acknowledges a duplicate ITN with 200 and records only once', async () => {
        const payload = signedItn(itnFields());
        const first = await postItn(payload);
        const second = await postItn(payload);
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        const succeeded = fakePrisma.payment.rows.filter((p: any) => p.status === 'SUCCEEDED');
        expect(succeeded).toHaveLength(1);
        expect(Number(fakePrisma.invoice.rows[0].balance)).toBe(0);
    });
});

describe('paymentsService.recordEftPayment — overpayment', () => {
    it('records the full amount, clamps the balance at 0 and surfaces the excess', async () => {
        const result = await paymentsService.recordEftPayment({
            invoiceId: 'inv_1',
            companyId: 'company_1',
            amount: 1200,
            reference: 'INV-1001 NKOSI',
        });
        expect(result.overpayment).toBe(50);
        expect(Number(result.invoice.balance)).toBe(0);
        expect(result.invoice.status).toBe('PAID');
        expect(Number(result.payment.amount)).toBe(1200);
        expect(result.payment.metadata).toMatchObject({ reference: 'INV-1001 NKOSI', overpayment: 50 });
    });
});
