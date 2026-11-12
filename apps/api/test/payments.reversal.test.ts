import { beforeEach, describe, expect, it, vi } from 'vitest';

// Replace the real database with the shared in-memory fake before the service
// (and its @fieldio/database import) is loaded.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { paymentsService } from '../src/modules/payments/payments.service';
import { invoiceService } from '../src/modules/invoices/invoices.service';
import { AppError } from '../src/middleware/error';

const COMPANY = 'company_1';
const ACTOR = { userId: 'user_office', role: 'OFFICE' };

const seedInvoice = (over: Record<string, any> = {}) => {
    const row = {
        id: 'inv_1',
        companyId: COMPANY,
        jobId: 'job_1',
        invoiceNumber: 'INV-00001',
        status: 'SENT',
        subtotal: 1000,
        tax: 150,
        total: 1150,
        balance: 1150,
        paidAt: null,
        ...over,
    };
    fakePrisma.invoice.seed([row]);
    return row;
};

beforeEach(() => {
    fakePrisma.$reset();
});

describe('payment against a VOID / DRAFT invoice', () => {
    it('refuses a manual payment on a VOID invoice with 409', async () => {
        seedInvoice({ status: 'VOID', balance: 0 });
        await expect(
            paymentsService.recordManualPayment({
                invoiceId: 'inv_1',
                companyId: COMPANY,
                amount: 1150,
                method: 'CASH',
            })
        ).rejects.toMatchObject({ statusCode: 409 });
        // The invoice must not have flipped to PAID.
        const inv = await fakePrisma.invoice.findFirst({ where: { id: 'inv_1' } });
        expect(inv.status).toBe('VOID');
        expect(fakePrisma.payment.rows).toHaveLength(0);
    });

    it('refuses a manual payment on a DRAFT invoice with 409', async () => {
        seedInvoice({ status: 'DRAFT' });
        await expect(
            paymentsService.recordManualPayment({
                invoiceId: 'inv_1',
                companyId: COMPANY,
                amount: 1150,
                method: 'CASH',
            })
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe('recordManualPayment stores the effective paidAt', () => {
    it('keeps metadata.paidAt from the office form', async () => {
        seedInvoice();
        const { payment } = await paymentsService.recordManualPayment({
            invoiceId: 'inv_1',
            companyId: COMPANY,
            amount: 1150,
            method: 'EFT',
            paidAt: '2026-11-03',
        });
        expect((payment.metadata as any).paidAt).toBe('2026-11-03');
    });
});

describe('payment reversal', () => {
    it('restores the invoice balance and lets the invoice be voided', async () => {
        seedInvoice();
        const { payment, invoice } = await paymentsService.recordManualPayment({
            invoiceId: 'inv_1',
            companyId: COMPANY,
            amount: 1150,
            method: 'CASH',
        });
        expect(invoice.status).toBe('PAID');
        expect(Number(invoice.balance)).toBe(0);

        const reversed = await paymentsService.reversePayment({
            paymentId: payment.id,
            companyId: COMPANY,
            reason: 'Keyed to the wrong invoice',
            actor: ACTOR,
        });

        expect(reversed.payment.status).toBe('REFUNDED');
        expect((reversed.payment.metadata as any).reversal.reason).toBe('Keyed to the wrong invoice');
        expect(reversed.payment.metadata.reversal.reversedBy).toBe('user_office');
        expect(reversed.invoice.status).toBe('SENT');
        expect(Number(reversed.invoice.balance)).toBe(1150);
        expect(reversed.invoice.paidAt).toBeNull();

        // An AuditLog row records the reversal.
        const audit = await fakePrisma.auditLog.findFirst({ where: { action: 'PAYMENT_REVERSED' } });
        expect(audit).toBeTruthy();
        expect(audit.entityId).toBe(payment.id);

        // With no SUCCEEDED payment remaining, the invoice can now be voided.
        const voided = await invoiceService.void('inv_1', COMPANY, 'Raised in error');
        expect(voided.status).toBe('VOID');
    });

    it('recomputes a PARTIAL balance when one of several payments is reversed', async () => {
        seedInvoice();
        const first = await paymentsService.recordManualPayment({
            invoiceId: 'inv_1',
            companyId: COMPANY,
            amount: 400,
            method: 'CASH',
        });
        await paymentsService.recordManualPayment({
            invoiceId: 'inv_1',
            companyId: COMPANY,
            amount: 750,
            method: 'EFT',
        });
        // 1150 paid in total → PAID. Reverse the first (400) → 750 remains → PARTIAL.
        const reversed = await paymentsService.reversePayment({
            paymentId: first.payment.id,
            companyId: COMPANY,
            reason: 'Duplicate capture',
            actor: ACTOR,
        });
        expect(reversed.invoice.status).toBe('PARTIAL');
        expect(Number(reversed.invoice.balance)).toBe(400);
    });

    it('rejects a second reversal of the same payment with 409', async () => {
        seedInvoice();
        const { payment } = await paymentsService.recordManualPayment({
            invoiceId: 'inv_1',
            companyId: COMPANY,
            amount: 1150,
            method: 'CASH',
        });
        await paymentsService.reversePayment({
            paymentId: payment.id,
            companyId: COMPANY,
            reason: 'First reversal',
            actor: ACTOR,
        });
        await expect(
            paymentsService.reversePayment({
                paymentId: payment.id,
                companyId: COMPANY,
                reason: 'Second reversal',
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('404s when the payment does not exist', async () => {
        await expect(
            paymentsService.reversePayment({
                paymentId: 'nope',
                companyId: COMPANY,
                reason: 'x',
                actor: ACTOR,
            })
        ).rejects.toBeInstanceOf(AppError);
    });
});
