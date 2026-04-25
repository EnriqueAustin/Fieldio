import Stripe from 'stripe';
import { config } from '../config/env';
import { logger } from '../utils/logger';

let stripeClient: Stripe | null = null;

export const getStripe = (): Stripe => {
    if (!stripeClient) {
        if (!config.STRIPE_SECRET_KEY) {
            throw new Error('STRIPE_SECRET_KEY is not configured');
        }
        stripeClient = new Stripe(config.STRIPE_SECRET_KEY, {
            apiVersion: '2024-04-10' as any,
            typescript: true,
        });
    }
    return stripeClient;
};

export const isStripeConfigured = () => Boolean(config.STRIPE_SECRET_KEY);

export const stripeService = {
    /**
     * Create a Checkout Session for an invoice. Returns the URL to redirect the customer to.
     */
    createInvoiceCheckout: async (params: {
        invoiceId: string;
        amount: number;
        currency: string;
        description: string;
        customerEmail?: string;
        successUrl: string;
        cancelUrl: string;
    }) => {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: params.customerEmail,
            line_items: [
                {
                    price_data: {
                        currency: params.currency.toLowerCase(),
                        product_data: { name: params.description },
                        unit_amount: Math.round(params.amount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: { invoiceId: params.invoiceId },
            payment_intent_data: { metadata: { invoiceId: params.invoiceId } },
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
        });
        logger.info({ invoiceId: params.invoiceId, sessionId: session.id }, 'Created Stripe checkout');
        return session;
    },

    constructWebhookEvent: (rawBody: Buffer, signature: string): Stripe.Event => {
        const stripe = getStripe();
        if (!config.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
        }
        return stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    },
};
