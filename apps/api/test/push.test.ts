import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const webpush = vi.hoisted(() => ({
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
}));
vi.mock('web-push', () => ({ default: webpush }));

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { config } from '../src/config/env';
import { notificationService } from '../src/services/notifications/notification.service';
import { pushService } from '../src/modules/push/push.service';

const app = buildTestApp();

const COMPANY = 'company_1';
const OTHER = 'company_2';
const tech = authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: 'tech_1' });
const tech2 = authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: 'tech_2' });

const FCM = 'https://fcm.googleapis.com/fcm/send/device-abc';
const subscription = (endpoint = FCM) => ({
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'BPublicKeyFromBrowser', auth: 'authSecret' },
});

const VAPID = {
    VAPID_PUBLIC_KEY: 'BTestPublicKey',
    VAPID_PRIVATE_KEY: 'testPrivateKey',
    VAPID_SUBJECT: 'mailto:ops@example.test',
};
const original = {
    VAPID_PUBLIC_KEY: config.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: config.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: config.VAPID_SUBJECT,
};

beforeEach(() => {
    fakePrisma.$reset();
    webpush.setVapidDetails.mockReset();
    webpush.sendNotification.mockReset();
    webpush.sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    Object.assign(config, VAPID);
});

afterEach(() => {
    Object.assign(config, original);
});

describe('GET /push/public-key', () => {
    it('returns the VAPID public key to a signed-in user', async () => {
        const res = await request(app).get('/push/public-key').set('Authorization', tech);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ enabled: true, publicKey: 'BTestPublicKey' });
    });

    it('reports push as disabled when VAPID keys are missing', async () => {
        Object.assign(config, { VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined });
        const res = await request(app).get('/push/public-key').set('Authorization', tech);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ enabled: false, publicKey: null });
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/push/public-key');
        expect(res.status).toBe(401);
    });
});

describe('POST /push/subscriptions', () => {
    it('stores the device for the caller, scoped to their company', async () => {
        const res = await request(app)
            .post('/push/subscriptions')
            .set('Authorization', tech)
            .set('User-Agent', 'Mozilla/5.0 (iPhone)')
            .send(subscription());

        expect(res.status).toBe(201);
        expect(fakePrisma.pushSubscription.rows).toHaveLength(1);
        expect(fakePrisma.pushSubscription.rows[0]).toMatchObject({
            userId: 'tech_1',
            companyId: COMPANY,
            endpoint: FCM,
            p256dh: 'BPublicKeyFromBrowser',
            auth: 'authSecret',
            userAgent: 'Mozilla/5.0 (iPhone)',
        });
    });

    it('upserts by endpoint instead of duplicating the device', async () => {
        await request(app).post('/push/subscriptions').set('Authorization', tech).send(subscription());
        const res = await request(app)
            .post('/push/subscriptions')
            .set('Authorization', tech)
            .send({ ...subscription(), keys: { p256dh: 'BRotatedKey', auth: 'newAuth' } });

        expect(res.status).toBe(201);
        expect(fakePrisma.pushSubscription.rows).toHaveLength(1);
        expect(fakePrisma.pushSubscription.rows[0]).toMatchObject({ p256dh: 'BRotatedKey', auth: 'newAuth' });
    });

    it('reassigns a device to the new user when someone else logs in on that phone', async () => {
        fakePrisma.pushSubscription.seed([
            { id: 'sub_old', companyId: OTHER, userId: 'someone_else', endpoint: FCM, p256dh: 'x', auth: 'y' },
        ]);

        const res = await request(app).post('/push/subscriptions').set('Authorization', tech).send(subscription());

        expect(res.status).toBe(201);
        expect(fakePrisma.pushSubscription.rows).toHaveLength(1);
        expect(fakePrisma.pushSubscription.rows[0]).toMatchObject({ userId: 'tech_1', companyId: COMPANY });
    });

    it('rejects an endpoint that is not a browser push service (400)', async () => {
        for (const endpoint of ['https://evil.example.com/hook', 'http://fcm.googleapis.com/fcm/send/x', 'not a url']) {
            const res = await request(app)
                .post('/push/subscriptions')
                .set('Authorization', tech)
                .send(subscription(endpoint));
            expect(res.status).toBe(400);
        }
        expect(fakePrisma.pushSubscription.rows).toHaveLength(0);
    });

    it('rejects a subscription without keys (400)', async () => {
        const res = await request(app).post('/push/subscriptions').set('Authorization', tech).send({ endpoint: FCM });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /push/subscriptions', () => {
    it('removes the caller\'s own device', async () => {
        fakePrisma.pushSubscription.seed([
            { id: 'sub_1', companyId: COMPANY, userId: 'tech_1', endpoint: FCM, p256dh: 'x', auth: 'y' },
        ]);
        const res = await request(app).delete('/push/subscriptions').set('Authorization', tech).send({ endpoint: FCM });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ removed: 1 });
        expect(fakePrisma.pushSubscription.rows).toHaveLength(0);
    });

    it('removes a previous user\'s subscription when this browser presents its endpoint', async () => {
        // tech_1's session expired on this phone; tech_2 signs in and clears it.
        fakePrisma.pushSubscription.seed([
            { id: 'sub_1', companyId: OTHER, userId: 'tech_1', endpoint: FCM, p256dh: 'x', auth: 'y' },
            { id: 'sub_2', companyId: COMPANY, userId: 'tech_1', endpoint: 'https://fcm.googleapis.com/other', p256dh: 'x', auth: 'y' },
        ]);
        const res = await request(app).delete('/push/subscriptions').set('Authorization', tech2).send({ endpoint: FCM });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ removed: 1 });
        // Only the presented endpoint goes; that user's other devices are untouched.
        expect(fakePrisma.pushSubscription.rows.map((r: { id: string }) => r.id)).toEqual(['sub_2']);
    });

    it('requires an endpoint (400)', async () => {
        const res = await request(app).delete('/push/subscriptions').set('Authorization', tech).send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /push/subscriptions/status', () => {
    it('tells the browser whether its subscription belongs to the signed-in user', async () => {
        fakePrisma.pushSubscription.seed([
            { id: 'sub_1', companyId: COMPANY, userId: 'tech_1', endpoint: FCM, p256dh: 'x', auth: 'y' },
        ]);
        const mine = await request(app).post('/push/subscriptions/status').set('Authorization', tech).send({ endpoint: FCM });
        expect(mine.body.data).toEqual({ registered: true, mine: true });

        const theirs = await request(app).post('/push/subscriptions/status').set('Authorization', tech2).send({ endpoint: FCM });
        expect(theirs.body.data).toEqual({ registered: true, mine: false });
        expect(JSON.stringify(theirs.body)).not.toContain('tech_1');

        const unknown = await request(app)
            .post('/push/subscriptions/status')
            .set('Authorization', tech)
            .send({ endpoint: 'https://fcm.googleapis.com/unknown' });
        expect(unknown.body.data).toEqual({ registered: false, mine: false });
    });
});

describe('notificationService.notifyUser web push', () => {
    const seedSubs = () => {
        fakePrisma.user.seed([
            { id: 'tech_1', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 't1@example.test' },
            { id: 'tech_2', companyId: COMPANY, role: 'TECHNICIAN', status: 'ACTIVE', email: 't2@example.test' },
        ]);
        fakePrisma.pushSubscription.seed([
            { id: 'sub_live', companyId: COMPANY, userId: 'tech_1', endpoint: FCM, p256dh: 'p1', auth: 'a1' },
            {
                id: 'sub_gone',
                companyId: COMPANY,
                userId: 'tech_1',
                endpoint: 'https://web.push.apple.com/QGone',
                p256dh: 'p2',
                auth: 'a2',
            },
            { id: 'sub_other', companyId: COMPANY, userId: 'tech_2', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p3', auth: 'a3' },
        ]);
    };

    it('pushes title, message, url and a per-job tag to every device of that user', async () => {
        seedSubs();
        await notificationService.notifyUser('tech_1', COMPANY, 'JOB_ASSIGNED', 'New job assigned', 'You have been assigned to: Geyser', {
            jobId: 'job_9',
            url: '/?job=job_9',
        });

        await vi.waitFor(() => expect(webpush.sendNotification).toHaveBeenCalledTimes(2));
        const endpoints = webpush.sendNotification.mock.calls.map((c) => c[0].endpoint).sort();
        expect(endpoints).toEqual(['https://fcm.googleapis.com/fcm/send/device-abc', 'https://web.push.apple.com/QGone']);

        const body = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
        expect(body).toEqual({
            title: 'New job assigned',
            body: 'You have been assigned to: Geyser',
            url: '/?job=job_9',
            tag: 'job-job_9',
        });
        expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.test', 'BTestPublicKey', 'testPrivateKey');
        // The in-app notification is still written as before.
        expect(fakePrisma.notification.rows).toHaveLength(1);
    });

    it('deletes subscriptions the push service reports gone (410) and keeps the rest', async () => {
        seedSubs();
        webpush.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
            if (sub.endpoint.includes('QGone')) {
                throw Object.assign(new Error('Gone'), { statusCode: 410 });
            }
            return { statusCode: 201, body: '', headers: {} };
        });

        await notificationService.notifyUser('tech_1', COMPANY, 'ALERT', 'Job moved', 'Geyser → Tue 09:00');

        await vi.waitFor(() =>
            expect(fakePrisma.pushSubscription.rows.map((r: { id: string }) => r.id).sort()).toEqual(['sub_live', 'sub_other']),
        );
    });

    it('never throws when the push service errors', async () => {
        seedSubs();
        webpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

        await expect(
            notificationService.notifyUser('tech_1', COMPANY, 'ALERT', 'Job moved', 'x'),
        ).resolves.toMatchObject({ title: 'Job moved' });
        await vi.waitFor(() => expect(webpush.sendNotification).toHaveBeenCalledTimes(2));
        expect(fakePrisma.pushSubscription.rows).toHaveLength(3);
    });

    it('drops a deactivated user\'s devices instead of pushing to them', async () => {
        seedSubs();
        fakePrisma.user.rows.find((u: { id: string }) => u.id === 'tech_1').status = 'INACTIVE';

        await pushService.sendToUser('tech_1', COMPANY, { title: 't', body: 'b', url: '/', tag: 't' });

        expect(webpush.sendNotification).not.toHaveBeenCalled();
        expect(fakePrisma.pushSubscription.rows.map((r: { id: string }) => r.id)).toEqual(['sub_other']);
    });

    it('keeps the quote amount out of the phone notification', async () => {
        fakePrisma.user.seed([
            { id: 'office_1', companyId: COMPANY, role: 'OFFICE', status: 'ACTIVE', email: 'o1@example.test' },
        ]);
        fakePrisma.pushSubscription.seed([
            { id: 'sub_office', companyId: COMPANY, userId: 'office_1', endpoint: FCM, p256dh: 'p', auth: 'a' },
        ]);

        await notificationService.notifyStaffEstimateDecision(COMPANY, 'APPROVED', {
            estimateId: 'est_12345678abc',
            customerName: 'Thabo Dlamini',
            total: 4250,
        });

        await vi.waitFor(() => expect(webpush.sendNotification).toHaveBeenCalledTimes(1));
        const body = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
        expect(body.body).toBe('Thabo Dlamini approved quote #est_1234.');
        expect(JSON.stringify(body)).not.toMatch(/4250|R \d/);
        // The in-app feed keeps the amount for the office.
        expect(fakePrisma.notification.rows[0].message).toContain('R 4250.00');
    });

    it('is a no-op when VAPID keys are not configured', async () => {
        seedSubs();
        Object.assign(config, { VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined });

        await notificationService.notifyUser('tech_1', COMPANY, 'ALERT', 'Job moved', 'x');
        await pushService.sendToUser('tech_1', COMPANY, { title: 't', body: 'b', url: '/', tag: 't' });

        expect(pushService.isEnabled()).toBe(false);
        expect(webpush.sendNotification).not.toHaveBeenCalled();
        expect(fakePrisma.notification.rows).toHaveLength(1);
    });
});
