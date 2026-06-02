import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' }); // Load from root

export const envSchema = z.object({
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    TRUST_PROXY: z.coerce.boolean().default(false),
    API_BODY_LIMIT: z.string().default('2mb'),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    API_URL: z.string().url(),
    WEB_URL: z.string().url(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Fieldio <noreply@fieldio.app>'),

    // SMS (Twilio)
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // S3 / R2 storage
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().optional(),

    // Maps
    MAPBOX_TOKEN: z.string().optional(),

    // WhatsApp Business API (Cloud API)
    WHATSAPP_API_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),

    // Google Reviews
    GOOGLE_REVIEW_DELAY_HOURS: z.coerce.number().default(2),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const parseEnv = (env: NodeJS.ProcessEnv): EnvConfig => {
    const parsed = envSchema.safeParse(env);

    if (!parsed.success) {
        throw new Error(`Invalid environment variables: ${JSON.stringify(parsed.error.format())}`);
    }

    return parsed.data;
};

export const loadEnvConfig = (env: NodeJS.ProcessEnv = process.env): EnvConfig => {
    try {
        return parseEnv(env);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid environment variables';
        console.error(message);
        process.exit(1);
    }
};

export const config =
    process.env.NODE_ENV === 'test' && process.env.FIELDIO_LOAD_ENV_CONFIG !== 'true'
        ? ({} as EnvConfig)
        : loadEnvConfig();
