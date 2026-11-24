import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { notificationService } from '../src/services/notifications/notification.service';
import { smsService } from '../src/services/notifications/sms.service';
import { whatsappService } from '../src/services/notifications/whatsapp.service';
import { emailService } from '../src/services/notifications/email.service';
import { paymentsService } from '../src/modules/payments/payments.service';
import { logger } from '../src/utils/logger';
import {
    defaultNotificationTemplates,
    type NotificationEvent,
    type NotificationTemplate,
} from '../src/modules/notifications/notification-templates';

const COMPANY = 'company_1';
const TRACKING = 'https://app.example.test/track/abc123';

const seed = (settings: Record<string, unknown> = {}) => {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Plumbing', settings }]);
    fakePrisma.customer.seed([
        { id: 'cust_1', companyId: COMPANY, name: 'Thabo Dlamini', phone: '+27821112222', email: 'thabo@example.test' },
    ]);
};

const templateOverride = (event: NotificationEvent, patch: Partial<NotificationTemplate>) => ({
    notifications: {
        templates: { [event]: { ...defaultNotificationTemplates[event], ...patch } },
    },
});

let smsEnRoute: ReturnType<typeof vi.spyOn>;
let smsStarted: ReturnType<typeof vi.spyOn>;
let smsCompleted: ReturnType<typeof vi.spyOn>;
let smsReminder: ReturnType<typeof vi.spyOn>;
let smsText: ReturnType<typeof vi.spyOn>;
let waText: ReturnType<typeof vi.spyOn>;
let waEnRoute: ReturnType<typeof vi.spyOn>;
let emailRaw: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fakePrisma.$reset();
    smsEnRoute = vi.spyOn(smsService, 'sendJobEnRoute');
    smsStarted = vi.spyOn(smsService, 'sendJobStarted');
    smsCompleted = vi.spyOn(smsService, 'sendJobCompleted');
    smsReminder = vi.spyOn(smsService, 'sendAppointmentReminder');
    smsText = vi.spyOn(smsService, 'sendText');
    waText = vi.spyOn(whatsappService, 'sendText');
    waEnRoute = vi.spyOn(whatsappService, 'sendJobEnRoute');
    emailRaw = vi.spyOn(emailService, 'sendRaw');
    vi.spyOn(whatsappService, 'isConfigured').mockReturnValue(false);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('notifyCustomer gate — defaults keep lifecycle messages on', () => {
    it('sends en route, started, completed and reminder messages for a company that never configured notifications', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_STARTED', { techName: 'Sipho' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', { jobTitle: 'Geyser' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'APPOINTMENT_REMINDER', { when: 'tomorrow 09:00' });

        expect(smsEnRoute).toHaveBeenCalledTimes(1);
        expect(smsStarted).toHaveBeenCalledTimes(1);
        expect(smsCompleted).toHaveBeenCalledTimes(1);
        expect(smsReminder).toHaveBeenCalledTimes(1);
    });

    it('also sends the booking confirmation (APPOINTMENT_REMINDER marked JOB_BOOKED) by default', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', COMPANY, 'APPOINTMENT_REMINDER', {
            event: 'JOB_BOOKED',
            when: 'Mon 09:00',
        });
        expect(smsReminder).toHaveBeenCalledTimes(1);
    });
});

describe('notifyCustomer gate — disabled settings stop the send', () => {
    it('sends nothing for an event whose template is disabled', async () => {
        seed(templateOverride('TECH_EN_ROUTE', { enabled: false }));
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });

        expect(smsEnRoute).not.toHaveBeenCalled();
        expect(waEnRoute).not.toHaveBeenCalled();
        expect(smsText).not.toHaveBeenCalled();
    });

    it('only silences the disabled event, not the others', async () => {
        seed(templateOverride('JOB_COMPLETED', { enabled: false }));
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', { jobTitle: 'Geyser' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho' });

        expect(smsCompleted).not.toHaveBeenCalled();
        expect(smsEnRoute).toHaveBeenCalledTimes(1);
    });

    it('master gate off silences every lifecycle message', async () => {
        seed({ notifications: { enabled: false } });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_STARTED', { techName: 'Sipho' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', { jobTitle: 'Geyser' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'APPOINTMENT_REMINDER', { when: 'tomorrow' });

        expect(smsEnRoute).not.toHaveBeenCalled();
        expect(smsStarted).not.toHaveBeenCalled();
        expect(smsCompleted).not.toHaveBeenCalled();
        expect(smsReminder).not.toHaveBeenCalled();
    });

    it('disabling the booking confirmation does not stop the 24h/1h reminders', async () => {
        seed(templateOverride('JOB_BOOKED', { enabled: false }));
        await notificationService.notifyCustomer('cust_1', COMPANY, 'APPOINTMENT_REMINDER', { event: 'JOB_BOOKED', when: 'Mon' });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'APPOINTMENT_REMINDER', { when: 'in about 1 hour' });

        expect(smsReminder).toHaveBeenCalledTimes(1);
        expect(smsReminder.mock.calls[0][1]).toBe('in about 1 hour');
    });

    it('does not send to another company customer', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', 'company_2', 'JOB_EN_ROUTE', { techName: 'Sipho' });
        expect(smsEnRoute).not.toHaveBeenCalled();
    });
});

describe('notifyCustomer gate — custom templates', () => {
    it('uses the company text on the company channel (SMS) for an edited template', async () => {
        seed(
            templateOverride('TECH_EN_ROUTE', {
                channel: 'SMS',
                body: 'Sawubona {{customerName}}, {{technicianName}} from {{companyName}} is coming.',
            })
        );
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });

        expect(smsEnRoute).not.toHaveBeenCalled();
        expect(smsText).toHaveBeenCalledTimes(1);
        const [phone, body] = smsText.mock.calls[0];
        expect(phone).toBe('+27821112222');
        expect(body).toContain('Sawubona Thabo Dlamini, Sipho from Mthembu Plumbing is coming.');
        // The tracking link is kept even though the custom text left it out.
        expect(body).toContain(TRACKING);
    });

    it('sends an edited EMAIL template by email with the rendered subject and body', async () => {
        seed(
            templateOverride('JOB_COMPLETED', {
                channel: 'EMAIL',
                subject: 'All done - {{companyName}}',
                body: 'Hi {{customerName}}, {{technicianName}} finished ref {{reference}}.',
            })
        );
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', { techName: 'Sipho', jobTitle: 'Geyser swap' });

        expect(emailRaw).toHaveBeenCalledTimes(1);
        expect(emailRaw.mock.calls[0].slice(0, 3)).toEqual([
            'thabo@example.test',
            'All done - Mthembu Plumbing',
            'Hi Thabo Dlamini, Sipho finished ref Geyser swap.',
        ]);
        expect(smsCompleted).not.toHaveBeenCalled();
    });

    it('falls back from WhatsApp to SMS when WhatsApp is not live', async () => {
        seed(templateOverride('JOB_COMPLETED', { channel: 'WHATSAPP', body: 'Done, {{customerName}}!' }));
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', {});

        expect(waText).not.toHaveBeenCalled();
        expect(smsText).toHaveBeenCalledTimes(1);
        expect(smsText.mock.calls[0][1]).toBe('Done, Thabo Dlamini!');
    });

    it('uses WhatsApp for an edited WHATSAPP template when it is live', async () => {
        seed({
            integrations: { whatsapp: { enabled: true } },
            ...templateOverride('JOB_COMPLETED', { channel: 'WHATSAPP', body: 'Done, {{customerName}}!' }),
        });
        vi.spyOn(whatsappService, 'isConfigured').mockReturnValue(true);
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_COMPLETED', {});

        expect(waText).toHaveBeenCalledTimes(1);
        expect(smsText).not.toHaveBeenCalled();
    });

    it('treats a previously shipped default body as unedited (legacy en-route text keeps the standard SMS)', async () => {
        seed(
            templateOverride('TECH_EN_ROUTE', {
                body:
                    'Hi {{customerName}}, your {{companyName}} technician {{technicianName}} is on the way ' +
                    'and should arrive in about {{etaMinutes}} minutes.',
            })
        );
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });

        expect(smsEnRoute).toHaveBeenCalledTimes(1);
        expect(smsText).not.toHaveBeenCalled();
    });

    it('fills the invoice due date from the invoice record', async () => {
        seed(
            templateOverride('INVOICE_SENT', {
                channel: 'EMAIL',
                subject: 'x',
                body: 'Due {{dueDate}}',
            })
        );
        fakePrisma.invoice.seed([{ id: 'inv_1', companyId: COMPANY, dueDate: new Date('2026-12-15T10:00:00Z') }]);
        vi.spyOn(paymentsService, 'getPayLinkForInvoice').mockResolvedValue('https://pay.test/inv1');
        await notificationService.notifyCustomer('cust_1', COMPANY, 'INVOICE_SENT', { invoiceId: 'inv_1', total: 10 });

        expect(emailRaw.mock.calls[0][2]).toMatch(/^Due 15 Dec 2026$/);
    });

    it('renders the invoice pay link into an edited invoice template', async () => {
        seed(
            templateOverride('INVOICE_SENT', {
                channel: 'EMAIL',
                subject: 'Invoice {{invoiceNumber}}',
                body: '{{amountDue}} due - pay: {{payUrl}}',
            })
        );
        vi.spyOn(paymentsService, 'getPayLinkForInvoice').mockResolvedValue('https://pay.test/inv1');
        await notificationService.notifyCustomer('cust_1', COMPANY, 'INVOICE_SENT', {
            invoiceId: 'inv_1',
            invoiceNumber: 'INV-00042',
            total: 115,
        });

        expect(emailRaw).toHaveBeenCalledTimes(1);
        expect(emailRaw.mock.calls[0][1]).toBe('Invoice INV-00042');
        expect(emailRaw.mock.calls[0][2]).toBe('ZAR 115.00 due - pay: https://pay.test/inv1');
    });
});

describe('en route SMS', () => {
    const smsBodies = () =>
        vi
            .mocked(logger.info)
            .mock.calls.map((c) => String(c[0]))
            .filter((m) => m.startsWith('[SMS:DEV]'));

    beforeEach(() => {
        vi.spyOn(logger, 'info').mockImplementation((() => undefined) as any);
    });

    it('includes the tracking URL and the company name, not "Fieldio"', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });

        const [body] = smsBodies();
        expect(body).toContain(TRACKING);
        expect(body).toContain('Mthembu Plumbing');
        expect(body).toContain('Sipho');
        expect(body).not.toMatch(/fieldio/i);
    });

    it('mentions an ETA only when one is provided', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING });
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: TRACKING, eta: '15 min' });

        const [without, withEta] = smsBodies();
        expect(without).not.toMatch(/ETA/);
        expect(withEta).toContain('ETA 15 min');
    });

    it('omits the track link when there is no tracking URL', async () => {
        seed({});
        await notificationService.notifyCustomer('cust_1', COMPANY, 'JOB_EN_ROUTE', { techName: 'Sipho', trackingUrl: '' });

        const [body] = smsBodies();
        expect(body).not.toMatch(/Track live/);
        expect(body).toContain('Mthembu Plumbing');
    });
});
