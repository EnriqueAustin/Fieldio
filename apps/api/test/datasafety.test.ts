import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

const notifyCustomer = vi.fn(async () => undefined);
const notifyUser = vi.fn(async () => undefined);
vi.mock('../src/services/notifications/notification.service', () => ({
    notificationService: {
        notifyCustomer: (...args: any[]) => (notifyCustomer as any)(...args),
        notifyUser: (...args: any[]) => (notifyUser as any)(...args),
        notifyStaff: async () => undefined,
        notifyStaffEstimateDecision: async () => undefined,
    },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';
import { healthRouter } from '../src/routes/health';
import { checkProductionSecrets, parseEnv, parseTrustProxy } from '../src/config/env';
import {
    endOfDayInTimeZone,
    formatInTimeZone,
    resolveTimeZone,
    startOfDayInTimeZone,
    startOfWeekInTimeZone,
} from '../src/utils/timezone';
import { checkSeedTarget } from '../../../packages/database/prisma/seed-guard';

describe('TRUST_PROXY parsing', () => {
    it.each([
        [undefined, false],
        ['', false],
        ['false', false],
        ['FALSE', false],
        ['0', false],
        ['true', 1],
        ['1', 1],
        ['2', 2],
        ['loopback', 'loopback'],
        ['10.0.0.0/8', '10.0.0.0/8'],
    ])('%s → %s', (raw, expected) => {
        expect(parseTrustProxy(raw)).toBe(expected);
    });

    it('is applied through the schema (the string "false" no longer means true)', () => {
        const env = parseEnv({ ...baseEnv(), TRUST_PROXY: 'false' } as any);
        expect(env.TRUST_PROXY).toBe(false);
        expect(parseEnv({ ...baseEnv(), TRUST_PROXY: 'true' } as any).TRUST_PROXY).toBe(1);
    });
});

function baseEnv() {
    return {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/fieldio',
        JWT_SECRET: 'a'.repeat(64),
        JWT_REFRESH_SECRET: 'b'.repeat(64),
        API_URL: 'http://localhost:3001',
        WEB_URL: 'http://localhost:3000',
    };
}

describe('production JWT secret checks', () => {
    it('rejects the .env.example placeholders in production', () => {
        const env = {
            ...baseEnv(),
            NODE_ENV: 'production',
            JWT_SECRET: 'CHANGE-ME-generate-a-64-char-random-secret-openssl-rand-hex-32',
            JWT_REFRESH_SECRET: 'CHANGE-ME-generate-a-64-char-refresh-secret-openssl-rand-hex32',
        };
        expect(() => parseEnv(env as any)).toThrow(/Refusing to start in production/);
    });

    it.each(['change-me', 'my-secret', 'EXAMPLE'])('rejects secrets containing %s', (word) => {
        const msg = checkProductionSecrets({
            NODE_ENV: 'production',
            JWT_SECRET: `${'x'.repeat(40)}${word}`,
            JWT_REFRESH_SECRET: 'b'.repeat(64),
        });
        expect(msg).toMatch(/JWT_SECRET looks like a placeholder/);
    });

    it('rejects identical access and refresh secrets', () => {
        const same = 'f'.repeat(64);
        expect(checkProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: same, JWT_REFRESH_SECRET: same }))
            .toMatch(/must be different/);
    });

    it('accepts real random secrets in production and ignores dev', () => {
        expect(() => parseEnv({ ...baseEnv(), NODE_ENV: 'production' } as any)).not.toThrow();
        expect(checkProductionSecrets({ NODE_ENV: 'development', JWT_SECRET: 'change-me', JWT_REFRESH_SECRET: 'change-me' }))
            .toBeNull();
    });
});

describe('timezone helper', () => {
    const tz = 'Africa/Johannesburg';

    it('formats a UTC 08:00 instant as 10:00 in Johannesburg', () => {
        const at = new Date('2026-11-07T08:00:00Z');
        expect(formatInTimeZone(at, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).toBe('10:00');
        expect(formatInTimeZone(at, tz)).toContain('10:00');
    });

    it('uses the company day, not the server day, for boundaries', () => {
        // 23:30 UTC on the 7th is already 01:30 on the 8th in SAST.
        const lateUtc = new Date('2026-11-07T23:30:00Z');
        expect(startOfDayInTimeZone(lateUtc, tz).toISOString()).toBe('2026-11-07T22:00:00.000Z');
        expect(endOfDayInTimeZone(lateUtc, tz).toISOString()).toBe('2026-11-08T21:59:59.999Z');
        expect(startOfDayInTimeZone(lateUtc, tz, -30).toISOString()).toBe('2026-10-08T22:00:00.000Z');
    });

    it('starts weeks on Monday 00:00 local', () => {
        // Sat 7 Nov 2026 → Mon 2 Nov 00:00 SAST.
        expect(startOfWeekInTimeZone(new Date('2026-11-07T08:00:00Z'), tz).toISOString()).toBe('2026-11-01T22:00:00.000Z');
    });

    it('handles DST zones and falls back on bad zones', () => {
        // US DST starts 8 Mar 2026; local midnight was still EST (UTC-5).
        expect(startOfDayInTimeZone(new Date('2026-03-08T12:00:00Z'), 'America/New_York').toISOString())
            .toBe('2026-03-08T05:00:00.000Z');
        expect(resolveTimeZone('Not/AZone')).toBe(tz);
        expect(resolveTimeZone(undefined)).toBe(tz);
    });
});

describe('seed guard', () => {
    const local = 'postgresql://postgres:postgres@localhost:5432/fieldio';

    it('allows local and docker-service databases outside production', () => {
        expect(checkSeedTarget({ DATABASE_URL: local }).ok).toBe(true);
        expect(checkSeedTarget({ DATABASE_URL: 'postgresql://u:p@127.0.0.1/fieldio' }).ok).toBe(true);
        expect(checkSeedTarget({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/fieldio' }).ok).toBe(true);
        expect(checkSeedTarget({ DATABASE_URL: 'postgresql://u:p@postgres:5432/fieldio' }).ok).toBe(true);
    });

    it('refuses production and remote hosts', () => {
        expect(checkSeedTarget({ NODE_ENV: 'production', DATABASE_URL: local }).ok).toBe(false);
        expect(checkSeedTarget({ DATABASE_URL: 'postgresql://u:p@db.prod.example.com:5432/fieldio' }).ok).toBe(false);
        expect(checkSeedTarget({}).ok).toBe(false);
    });

    it('only honours an override naming the exact database', () => {
        const remote = 'postgresql://u:p@db.staging.example.com:5432/fieldio_staging?schema=public';
        expect(checkSeedTarget({ DATABASE_URL: remote, ALLOW_DESTRUCTIVE_SEED: 'yes' }).ok).toBe(false);
        expect(checkSeedTarget({ DATABASE_URL: remote, ALLOW_DESTRUCTIVE_SEED: 'yes-wipe-fieldio' }).ok).toBe(false);
        expect(checkSeedTarget({ DATABASE_URL: remote, ALLOW_DESTRUCTIVE_SEED: 'yes-wipe-fieldio_staging' }).ok).toBe(true);
    });
});

describe('GET /health/db', () => {
    it('returns status only — no cross-tenant counts', async () => {
        const app = express();
        app.use('/health', healthRouter);
        fakePrisma.user.seed([{ id: 'u1', companyId: 'c1' }, { id: 'u2', companyId: 'c2' }]);

        const res = await request(app).get('/health/db');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    });
});

describe('POST /jobs/quick with a technician', () => {
    const COMPANY = 'company_1';
    const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
    const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
    const TECH_ID = '55555555-5555-4555-8555-555555555555';

    function buildApp(): Express {
        const app = express();
        app.use(express.json());
        app.use(deserializeUser);
        app.use('/jobs', jobRouter);
        app.use(errorHandler);
        return app;
    }

    beforeEach(() => {
        fakePrisma.$reset();
        notifyCustomer.mockClear();
        notifyUser.mockClear();
        const tech = { id: TECH_ID, companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', firstName: 'Sipho', lastName: 'Nkosi', email: 'sipho@example.com' };
        const customer = { id: CUSTOMER_ID, companyId: COMPANY, name: 'Braamfontein Body Corporate', phone: '+27821234567' };
        fakePrisma.user.seed([tech]);
        fakePrisma.customer.seed([customer]);
        fakePrisma.property.seed([{ id: PROPERTY_ID, companyId: COMPANY, customerId: CUSTOMER_ID, addressLine1: '152 Smit Street', city: 'Braamfontein', state: 'GP', zip: '2001' }]);

        // The fake doesn't resolve `include`; embed tech + customer the way
        // Prisma would, so the old notification branch would have fired.
        const realCreate = fakePrisma.job.create.bind(fakePrisma.job);
        vi.spyOn(fakePrisma.job, 'create').mockImplementation(async (args: any) => ({
            ...(await realCreate(args)),
            tech,
            customer,
        }));
    });

    it('notifies the technician but does not send the customer an en-route message', async () => {
        const res = await request(buildApp())
            .post('/jobs/quick')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY }))
            .send({
                customerName: 'Braamfontein Body Corporate',
                title: 'Leaking basin tap',
                existingCustomerId: CUSTOMER_ID,
                existingPropertyId: PROPERTY_ID,
                techId: TECH_ID,
            });

        expect(res.status).toBe(201);
        expect(notifyUser).toHaveBeenCalledWith(TECH_ID, COMPANY, 'JOB_ASSIGNED', expect.any(String), expect.any(String));
        const customerTypes = notifyCustomer.mock.calls.map((c: any[]) => c[2]);
        expect(customerTypes).not.toContain('JOB_EN_ROUTE');
    });
});
