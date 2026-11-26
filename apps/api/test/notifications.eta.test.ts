import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { config } from '../src/config/env';
import { notificationService } from '../src/services/notifications/notification.service';
import { smsService } from '../src/services/notifications/sms.service';
import { whatsappService } from '../src/services/notifications/whatsapp.service';
import {
    NOTIFICATION_PLACEHOLDERS,
    defaultNotificationTemplates,
} from '../src/modules/notifications/notification-templates';

const COMPANY = 'company_1';
const TRACKING = 'https://app.example.test/track/abc123';

const seed = (settings: Record<string, unknown>) => {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings }]);
    fakePrisma.customer.seed([{ id: 'cust_1', companyId: COMPANY, name: 'Thabo Dlamini', phone: '+27821112222', email: null }]);
};
const whatsappOn = { integrations: { whatsapp: { enabled: true } } };

const original = {
    WHATSAPP_API_TOKEN: config.WHATSAPP_API_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: config.WHATSAPP_PHONE_NUMBER_ID,
};
let fetchMock: ReturnType<typeof vi.fn>;

/** Text bodies of every WhatsApp message posted to the (stubbed) Cloud API. */
const sentWhatsappBodies = (): string[] =>
    fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).text.body);

beforeEach(() => {
    fakePrisma.$reset();
    Object.assign(config, { WHATSAPP_API_TOKEN: 'wa-test-token', WHATSAPP_PHONE_NUMBER_ID: '123' });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    Object.assign(config, original);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('JOB_EN_ROUTE ETA on WhatsApp', () => {
    it('appends the ETA when the GPS worker supplied one', async () => {
        seed(whatsappOn);
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', {
            techName: 'Sipho',
            trackingUrl: TRACKING,
            eta: '15 min',
        });

        const [body] = sentWhatsappBodies();
        expect(body).toContain('Sipho is on the way! ETA about 15 min.');
        expect(body).toContain(TRACKING);
    });

    it('leaves the ETA out when there is no fresh fix', async () => {
        seed(whatsappOn);
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', eta: '' });

        const bodies = sentWhatsappBodies();
        expect(bodies).toHaveLength(2);
        for (const body of bodies) expect(body).not.toMatch(/ETA/);
    });
});

describe('{{eta}} template variable for TECH_EN_ROUTE', () => {
    it('is listed as a placeholder but not used in the default body', () => {
        expect(NOTIFICATION_PLACEHOLDERS.TECH_EN_ROUTE).toContain('eta');
        expect(defaultNotificationTemplates.TECH_EN_ROUTE.body).not.toContain('{{eta}}');
    });

    it('renders in an edited template, and blank without an ETA', async () => {
        const smsText = vi.spyOn(smsService, 'sendText');
        vi.spyOn(whatsappService, 'isConfigured').mockReturnValue(false);
        seed({
            notifications: {
                templates: {
                    TECH_EN_ROUTE: {
                        ...defaultNotificationTemplates.TECH_EN_ROUTE,
                        channel: 'SMS',
                        body: '{{technicianName}} is coming. ETA: [{{eta}}]',
                    },
                },
            },
        });

        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', eta: '15 min' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho' });

        expect(smsText.mock.calls[0][1]).toContain('Sipho is coming. ETA: [15 min]');
        expect(smsText.mock.calls[1][1]).toContain('Sipho is coming. ETA: []');
    });
});
