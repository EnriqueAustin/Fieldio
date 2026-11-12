import express, { Router } from 'express';
import { paymentsController } from '../modules/payments/payments.controller';
import { paymentsService } from '../modules/payments/payments.service';
import { invoiceController } from '../modules/invoices/invoices.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { catchAsync } from '../utils/catchAsync';
import { logger } from '../utils/logger';

/**
 * Public payment routes (no auth) — customer-facing pay-link flow.
 */
export const publicPaymentsRouter = Router();
publicPaymentsRouter.get('/invoices/:token', catchAsync(paymentsController.getPublicInvoice));
// Public tax invoice PDF for the customer pay page (404 for unknown/soft-deleted).
publicPaymentsRouter.get('/invoices/:token/pdf', catchAsync(invoiceController.publicPdf));
publicPaymentsRouter.post(
    '/invoices/:token/checkout',
    catchAsync(paymentsController.createCheckoutSession)
);
publicPaymentsRouter.post(
    '/invoices/:token/payfast',
    catchAsync(paymentsController.createPayFastCheckout)
);
// PayFast posts form-urlencoded; parse here so the route doesn't depend on app-level parsers.
publicPaymentsRouter.post(
    '/payfast/notify',
    express.urlencoded({ extended: false, limit: '32kb' }),
    catchAsync(paymentsController.handlePayFastITN)
);

/**
 * Stripe webhook — must use raw body. Mounted directly on the app.
 */
export const stripeWebhookHandler = async (req: any, res: any) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).send('Missing signature');
    try {
        const result = await paymentsService.handleStripeWebhook(req.body, signature);
        res.json(result);
    } catch (err: any) {
        logger.error({ err: err.message }, 'Stripe webhook error');
        res.status(400).send('Webhook processing failed');
    }
};

/**
 * Authenticated payment ops (used by office staff).
 */
export const paymentsRouter = Router();
paymentsRouter.use(requireUser);
paymentsRouter.get(
    '/invoices/:invoiceId/pay-link',
    restrictTo('ADMIN', 'OFFICE'),
    catchAsync(paymentsController.getPayLink)
);
paymentsRouter.post(
    '/invoices/:invoiceId/record',
    restrictTo('ADMIN', 'OFFICE'),
    idempotency,
    catchAsync(paymentsController.recordManual)
);
// Reverse a mis-keyed payment. ACCOUNTANT may correct the books too.
paymentsRouter.post(
    '/:paymentId/reverse',
    restrictTo('ADMIN', 'OFFICE', 'ACCOUNTANT'),
    idempotency,
    catchAsync(paymentsController.reverse)
);
