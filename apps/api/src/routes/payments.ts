import { Router } from 'express';
import { paymentsController } from '../modules/payments/payments.controller';
import { paymentsService } from '../modules/payments/payments.service';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { logger } from '../utils/logger';

/**
 * Public payment routes (no auth) — customer-facing pay-link flow.
 */
export const publicPaymentsRouter = Router();
publicPaymentsRouter.get('/invoices/:token', catchAsync(paymentsController.getPublicInvoice));
publicPaymentsRouter.post(
    '/invoices/:token/checkout',
    catchAsync(paymentsController.createCheckoutSession)
);
publicPaymentsRouter.post(
    '/invoices/:token/payfast',
    catchAsync(paymentsController.createPayFastCheckout)
);
publicPaymentsRouter.post(
    '/payfast/notify',
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
    catchAsync(paymentsController.recordManual)
);
