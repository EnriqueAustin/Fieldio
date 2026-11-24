import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import {
    defaultNotificationSettings,
    renderNotificationForEvent,
    type NotificationSettings,
} from '../src/modules/notifications/notification-templates';

const app = buildTestApp();
const COMPANY = 'company_1';
const admin = authHeader({ role: 'ADMIN', companyId: COMPANY, userId: 'admin_1' });
const office = authHeader({ role: 'OFFICE', companyId: COMPANY, userId: 'office_1' });
const tech = authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: 'tech_1' });

// A full, valid PUT body (the form submits every template's current state).
// Deep-cloned so a test mutating `body.templates.X` never touches the shared default.
const validBody = (over: Partial<NotificationSettings> = {}): NotificationSettings => ({
    ...structuredClone(defaultNotificationSettings),
    ...over,
});

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings: {} }]);
});

describe('GET /notification-templates', () => {
    it('returns the templates with the master gate ON by default (lifecycle messages keep sending)', async () => {
        const res = await request(app).get('/notification-templates').set('Authorization', admin);
        expect(res.status).toBe(200);
        expect(res.body.data.notifications.enabled).toBe(true);
        expect(res.body.data.notifications.templates.JOB_BOOKED.channel).toBe('EMAIL');
        expect(res.body.data.notifications.templates.TECH_EN_ROUTE.channel).toBe('SMS');
        // Placeholders are advertised for the page's chips.
        expect(res.body.data.placeholders.JOB_BOOKED).toContain('customerName');
    });

    it('is forbidden for OFFICE (403) — config is ADMIN only', async () => {
        const res = await request(app).get('/notification-templates').set('Authorization', office);
        expect(res.status).toBe(403);
    });

    it('is forbidden for a TECHNICIAN (403)', async () => {
        const res = await request(app).get('/notification-templates').set('Authorization', tech);
        expect(res.status).toBe(403);
    });
});

describe('PUT /notification-templates', () => {
    it('persists the master gate and a template edit (ADMIN)', async () => {
        const body = validBody({ enabled: true });
        body.templates = {
            ...body.templates,
            JOB_BOOKED: { ...body.templates.JOB_BOOKED, subject: 'Booked!', body: 'Hi {{customerName}}' },
        };

        const res = await request(app).put('/notification-templates').set('Authorization', admin).send(body);
        expect(res.status).toBe(200);
        expect(res.body.data.notifications.enabled).toBe(true);
        expect(res.body.data.notifications.templates.JOB_BOOKED.subject).toBe('Booked!');

        // Round-trips through a fresh GET.
        const get = await request(app).get('/notification-templates').set('Authorization', admin);
        expect(get.body.data.notifications.enabled).toBe(true);
        expect(get.body.data.notifications.templates.JOB_BOOKED.body).toBe('Hi {{customerName}}');
    });

    it('is forbidden for OFFICE (403)', async () => {
        const res = await request(app)
            .put('/notification-templates')
            .set('Authorization', office)
            .send(validBody({ enabled: true }));
        expect(res.status).toBe(403);
    });

    it('rejects an invalid channel (400)', async () => {
        const body: any = validBody();
        body.templates.JOB_BOOKED.channel = 'PIGEON';
        const res = await request(app).put('/notification-templates').set('Authorization', admin).send(body);
        expect(res.status).toBe(400);
    });

    it('scopes the write to the caller company only', async () => {
        fakePrisma.company.seed([{ id: 'company_2', name: 'Other', settings: {} }]);
        await request(app)
            .put('/notification-templates')
            .set('Authorization', admin)
            .send(validBody({ enabled: true }))
            .expect(200);

        const other = fakePrisma.company.rows.find((r: any) => r.id === 'company_2');
        // The other company's settings were never touched.
        expect(other.settings).toEqual({});
    });
});

describe('renderNotificationForEvent — the gate triggers call', () => {
    const vars = { customerName: 'Thabo', companyName: 'Mthembu Plumbing' };

    it('returns null when the master gate is off', () => {
        const settings = { ...defaultNotificationSettings, enabled: false };
        expect(renderNotificationForEvent(settings, 'JOB_BOOKED', vars)).toBeNull();
    });

    it('returns null when the per-event template is disabled', () => {
        const settings: NotificationSettings = {
            enabled: true,
            templates: {
                ...defaultNotificationSettings.templates,
                JOB_BOOKED: { ...defaultNotificationSettings.templates.JOB_BOOKED, enabled: false },
            },
        };
        expect(renderNotificationForEvent(settings, 'JOB_BOOKED', vars)).toBeNull();
    });

    it('renders and interpolates {{tokens}} when both gates are on', () => {
        const settings = { ...defaultNotificationSettings, enabled: true };
        const out = renderNotificationForEvent(settings, 'JOB_BOOKED', vars);
        expect(out).not.toBeNull();
        expect(out!.channel).toBe('EMAIL');
        expect(out!.subject).toContain('Mthembu Plumbing');
        expect(out!.body).toContain('Hi Thabo,');
        // Unsupplied tokens collapse to empty string, never left as {{...}}.
        expect(out!.body).not.toContain('{{');
    });
});
