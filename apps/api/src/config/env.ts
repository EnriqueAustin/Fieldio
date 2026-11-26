import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' }); // Load from root

export type TrustProxySetting = boolean | number | string;

/**
 * Parses TRUST_PROXY for `app.set('trust proxy', …)`.
 * unset/""/"false"/"0" → false; "true" → 1 (one hop — never trust-all, which
 * would let any client spoof X-Forwarded-For); "<n>" → n hops; anything else
 * (e.g. "loopback", "10.0.0.0/8") is passed through to Express as-is.
 * (z.coerce.boolean() used to turn the string "false" into true.)
 */
export const parseTrustProxy = (raw: unknown): TrustProxySetting => {
    if (raw === undefined || raw === null) return false;
    if (typeof raw === 'boolean') return raw ? 1 : false;
    if (typeof raw === 'number') return raw > 0 ? raw : false;
    const value = String(raw).trim();
    const lower = value.toLowerCase();
    if (lower === '' || lower === 'false' || lower === '0') return false;
    if (lower === 'true') return 1;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
};

/**
 * Parses a strict boolean env flag: true only for "true"/"1" (case-insensitive);
 * everything else — including unset — is false. Used for opt-in feature gates
 * that must default OFF.
 */
export const parseBooleanFlag = (raw: unknown): boolean => {
    if (typeof raw === 'boolean') return raw;
    const value = String(raw ?? '').trim().toLowerCase();
    return value === 'true' || value === '1';
};

const blankToUndefined = (raw: unknown): unknown =>
    typeof raw === 'string' && raw.trim() === '' ? undefined : raw;

const PLACEHOLDER_SECRET = /change|secret|example/i;

/** Returns a startup error when production JWT secrets are placeholders, else null. */
export const checkProductionSecrets = (env: { NODE_ENV?: string; JWT_SECRET?: string; JWT_REFRESH_SECRET?: string }): string | null => {
    if (env.NODE_ENV !== 'production') return null;
    const problems: string[] = [];
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (PLACEHOLDER_SECRET.test(env[key] ?? '')) {
            problems.push(`${key} looks like a placeholder (contains "change"/"secret"/"example")`);
        }
    }
    if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
        problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
    }
    return problems.length
        ? `Refusing to start in production: ${problems.join('; ')}. Generate real values with \`openssl rand -hex 32\`.`
        : null;
};

export const envSchema = z.object({
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    TRUST_PROXY: z.any().transform(parseTrustProxy),
    API_BODY_LIMIT: z.string().default('2mb'),
    // Public self-registration (POST /auth/register). OFF unless explicitly "true"/"1".
    ALLOW_PUBLIC_REGISTRATION: z.any().transform(parseBooleanFlag),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
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

    // Web Push (VAPID). All optional: without both keys push is a logged no-op.
    // Blank values (as copied from .env.example) count as unset.
    VAPID_PUBLIC_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    VAPID_PRIVATE_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    VAPID_SUBJECT: z.preprocess(
        blankToUndefined,
        z.string().regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT must start with mailto: or https://').optional(),
    ),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const parseEnv = (env: NodeJS.ProcessEnv): EnvConfig => {
    const parsed = envSchema.safeParse(env);

    if (!parsed.success) {
        throw new Error(`Invalid environment variables: ${JSON.stringify(parsed.error.format())}`);
    }

    const secretsError = checkProductionSecrets(parsed.data);
    if (secretsError) throw new Error(secretsError);

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
