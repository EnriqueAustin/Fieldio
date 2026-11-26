import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Writable } from 'stream';
import twilio from 'twilio';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { config } from '../src/config/env';
import { socketService, stripPriceFields } from '../src/services/socket.service';
import { smsService } from '../src/services/notifications/sms.service';
import { emailService } from '../src/services/notifications/email.service';

const app = buildTestApp();
const AUTH_TOKEN = 'twilio-test-auth-token';
const INBOUND_PATH = '/public/messaging/twilio/inbound';

const originalEnv = process.env.NODE_ENV;
const originalToken = config.TWILIO_AUTH_TOKEN;

const sign = (url: string, params: Record<string, string>) =>
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);

const inboundParams = (overrides: Record<string, string> = {}) => ({
    From: '+27821112222',
    To: '+27215550000',
    Body: 'Geyser is leaking',
    MessageSid: 'SM123',
    NumMedia: '0',
    ...overrides,
});

const seedCompanies = () => {
    fakePrisma.company.seed([
        { id: 'company_1', name: 'Mthembu Plumbing', settings: { integrations: { twilio: { phoneNumber: '+27 21 555 0000' } } } },
        { id: 'company_2', name: 'Other Co', settings: {} },
    ]);
};

beforeEach(() => {
    fakePrisma.$reset();
    seedCompanies();
});

afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    (config as any).TWILIO_AUTH_TOKEN = originalToken;
});

describe('POST /public/messaging/twilio/inbound — signature', () => {
    it('rejects an unsigned webhook in production', async () => {
        process.env.NODE_ENV = 'production';
        (config as any).TWILIO_AUTH_TOKEN = AUTH_TOKEN;
        const res = await request(app).post(INBOUND_PATH).type('form').send(inboundParams());
        expect(res.status).toBe(403);
        expect(fakePrisma.smsMessage.rows).toHaveLength(0);
    });

    it('rejects a badly-signed webhook in production', async () => {
        process.env.NODE_ENV = 'production';
        (config as any).TWILIO_AUTH_TOKEN = AUTH_TOKEN;
        const params = inboundParams();
        const res = await request(app)
            .post(INBOUND_PATH)
            .set('X-Twilio-Signature', sign(`${config.API_URL}${INBOUND_PATH}`, { ...params, Body: 'tampered' }))
            .type('form')
            .send(params);
        expect(res.status).toBe(403);
        expect(fakePrisma.smsMessage.rows).toHaveLength(0);
    });

    it('rejects every webhook in production when TWILIO_AUTH_TOKEN is missing', async () => {
        process.env.NODE_ENV = 'production';
        (config as any).TWILIO_AUTH_TOKEN = undefined;
        const res = await request(app).post(INBOUND_PATH).type('form').send(inboundParams());
        expect(res.status).toBe(403);
    });

    it('accepts a correctly signed webhook and routes it by the To number', async () => {
        process.env.NODE_ENV = 'production';
        (config as any).TWILIO_AUTH_TOKEN = AUTH_TOKEN;
        const params = inboundParams();
        const res = await request(app)
            .post(INBOUND_PATH)
            .set('X-Twilio-Signature', sign(`${config.API_URL}${INBOUND_PATH}`, params))
            .type('form')
            .send(params);
        expect(res.status).toBe(200);
        expect(fakePrisma.smsMessage.rows).toHaveLength(1);
        expect(fakePrisma.smsMessage.rows[0].companyId).toBe('company_1');
    });
});

describe('POST /public/messaging/twilio/inbound — company resolution', () => {
    it('ignores companyId in the query string and body', async () => {
        const res = await request(app)
            .post(`${INBOUND_PATH}?companyId=company_2`)
            .type('form')
            .send(inboundParams({ companyId: 'company_2' }));
        expect(res.status).toBe(200);
        expect(fakePrisma.smsMessage.rows).toHaveLength(1);
        expect(fakePrisma.smsMessage.rows[0].companyId).toBe('company_1');
        expect(fakePrisma.smsThread.rows[0].companyId).toBe('company_1');
    });

    it('drops a message for an unknown number when several companies exist', async () => {
        const res = await request(app)
            .post(`${INBOUND_PATH}?companyId=company_2`)
            .type('form')
            .send(inboundParams({ To: '+27119990000' }));
        expect(res.status).toBe(200);
        expect(fakePrisma.smsMessage.rows).toHaveLength(0);
    });

    it('falls back to the only company on a single-company install', async () => {
        fakePrisma.$reset();
        fakePrisma.company.seed([{ id: 'solo', name: 'Solo Plumbing', settings: {} }]);
        const res = await request(app).post(INBOUND_PATH).type('form').send(inboundParams({ To: '+27119990000' }));
        expect(res.status).toBe(200);
        expect(fakePrisma.smsMessage.rows[0].companyId).toBe('solo');
    });
});

describe('providers without credentials', () => {
    it('records FAILED (never a fake SENT) for SMS in production', async () => {
        process.env.NODE_ENV = 'production';
        const result = await smsService.sendText('+27821112222', 'hi', 'company_1');
        expect(result.ok).toBe(false);
        const log = fakePrisma.notificationLog.rows[0];
        expect(log.status).toBe('FAILED');
        expect(log.providerId).toBeUndefined();
        expect(log.error).toMatch(/not configured/);
    });

    it('records FAILED for email in production', async () => {
        process.env.NODE_ENV = 'production';
        const result = await emailService.sendRaw('a@b.co', 'Hi', 'body', 'company_1');
        expect(result.ok).toBe(false);
        expect(fakePrisma.notificationLog.rows[0].status).toBe('FAILED');
    });

    it('keeps the dev stub outside production', async () => {
        const result = await smsService.sendText('+27821112222', 'hi', 'company_1');
        expect(result.ok).toBe(true);
        expect(fakePrisma.notificationLog.rows[0]).toMatchObject({ status: 'SENT', providerId: 'dev-stub' });
    });

    it('marks an inbox send FAILED in production', async () => {
        process.env.NODE_ENV = 'production';
        const res = await request(app)
            .post('/messaging/send')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ phone: '+27821112222', body: 'Your plumber is on the way' });
        expect(res.status).toBe(201);
        expect(res.body.data.message.status).toBe('FAILED');
        expect(res.body.data.message.errorReason).toMatch(/not configured/);
    });
});

describe('logger redaction', () => {
    it('redacts authorization, cookies and body secrets', async () => {
        const actual = await vi.importActual<typeof import('../src/utils/logger')>('../src/utils/logger');
        const pino = (await import('pino')).default;
        const lines: string[] = [];
        const stream = new Writable({
            write(chunk, _enc, cb) {
                lines.push(chunk.toString());
                cb();
            },
        });
        const log = pino({ ...actual.loggerOptions, level: 'info' }, stream);
        log.info({
            req: { headers: { authorization: 'Bearer secret-jwt', cookie: 'refresh=abc' }, body: { password: 'hunter2', merchantKey: 'mk' } },
            res: { headers: { 'set-cookie': 'refresh=abc' } },
        });
        const out = lines.join('');
        expect(out).not.toContain('secret-jwt');
        expect(out).not.toContain('refresh=abc');
        expect(out).not.toContain('hunter2');
        expect(out).not.toContain('"mk"');
        expect(out).toContain('[REDACTED]');
    });
});

describe('socket routing', () => {
    const makeIo = () => {
        const sent: Array<{ rooms: string[]; event: string; data: any }> = [];
        const io = {
            to: (rooms: string | string[]) => ({
                emit: (event: string, data: any) => {
                    sent.push({ rooms: ([] as string[]).concat(rooms), event, data });
                },
            }),
        };
        (socketService as any).io = io;
        return sent;
    };
    afterEach(() => {
        (socketService as any).io = null;
    });

    it('sends notifications to the user room only', () => {
        const sent = makeIo();
        socketService.emitToCompany('company_1', 'notification:received', { userId: 'u1', title: 'x' });
        expect(sent).toEqual([{ rooms: ['user:u1'], event: 'notification:received', data: { userId: 'u1', title: 'x' } }]);
    });

    it('keeps invoice:paid to office roles', () => {
        const sent = makeIo();
        socketService.emitToCompany('company_1', 'invoice:paid', { invoiceId: 'i1', amount: 500 });
        expect(sent).toHaveLength(1);
        expect(sent[0].rooms.sort()).toEqual(['role:company_1:ADMIN', 'role:company_1:DISPATCHER', 'role:company_1:OFFICE']);
    });

    it('strips prices from line items for non-office roles', () => {
        const sent = makeIo();
        socketService.emitToCompany('company_1', 'job:lineitem:added', {
            jobId: 'j1',
            item: { id: 'li1', name: 'Geyser valve', quantity: 2, unitPrice: 350, total: 700 },
        });
        const office = sent.find((s) => s.rooms.includes('role:company_1:OFFICE'))!;
        // Job events no longer go to the technician role room (only the job's
        // crew, via user rooms: see socket.scoping.test.ts); the non-office staff
        // roles still get the price-stripped copy.
        const field = sent.find((s) => s.rooms.includes('role:company_1:CSR'))!;
        expect(office.data.item.unitPrice).toBe(350);
        expect(field.data.item).toEqual({ id: 'li1', name: 'Geyser valve', quantity: 2 });
        expect(field.rooms).not.toContain('role:company_1:ADMIN');
        expect(sent.flatMap((s) => s.rooms)).not.toContain('role:company_1:TECHNICIAN');
    });

    it('stripPriceFields removes nested money', () => {
        expect(
            stripPriceFields({ id: 'j', status: 'IN_PROGRESS', invoice: { total: 1 }, lineItems: [{ name: 'a', unitPrice: 2 }] })
        ).toEqual({ id: 'j', status: 'IN_PROGRESS', lineItems: [{ name: 'a' }] });
    });
});

describe('customer SMS inbox is office-only', () => {
    it('blocks technicians from listing or opening threads', async () => {
        const app = buildTestApp();
        const tech = authHeader({ role: 'TECHNICIAN' });
        expect((await request(app).get('/messaging/threads').set('Authorization', tech)).status).toBe(403);
        expect((await request(app).get('/messaging/threads/t_1').set('Authorization', tech)).status).toBe(403);
    });

    it('still lets office staff list threads', async () => {
        const app = buildTestApp();
        const res = await request(app).get('/messaging/threads').set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
    });
});
