import { z } from 'zod';

// Automated customer notifications. One template per lifecycle event. Stored on
// company settings (company.settings.notifications) — no dedicated table.
//
// The whole feature sits behind `enabled` (the master gate) and a per-event
// `enabled` flag. BOTH default to ON: the core lifecycle messages (booking,
// reminders, en route, completed, invoice, quote) have always been sent, so a
// company that never touched these settings must keep getting them. A company
// opts out by switching the master gate or an individual event off.
// notificationService.notifyCustomer checks both before every customer message.

export const NOTIFICATION_EVENTS = [
    'JOB_BOOKED',
    'TECH_EN_ROUTE',
    'JOB_COMPLETED',
    'INVOICE_SENT',
    'QUOTE_SENT',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Placeholder tokens a trigger can supply for each event. These are the
 * contract between this module and the send-on-event triggers: a trigger must
 * pass `vars` keyed by these tokens. The web settings page shows the same list
 * as clickable chips. Syntax matches the dunning templates exactly: {{token}}.
 */
export const NOTIFICATION_PLACEHOLDERS: Record<NotificationEvent, string[]> = {
    JOB_BOOKED: ['customerName', 'companyName', 'jobDate'],
    // `eta` (e.g. "15 min") is empty when the tech has no fresh GPS fix.
    TECH_EN_ROUTE: ['customerName', 'companyName', 'technicianName', 'trackingUrl', 'eta'],
    JOB_COMPLETED: ['customerName', 'companyName', 'technicianName', 'reference'],
    INVOICE_SENT: ['customerName', 'companyName', 'invoiceNumber', 'amountDue', 'dueDate', 'payUrl'],
    QUOTE_SENT: ['customerName', 'companyName', 'quoteNumber', 'quoteTotal', 'quoteUrl'],
};

const templateSchema = z.object({
    enabled: z.boolean(),
    channel: z.enum(NOTIFICATION_CHANNELS),
    // Email only; ignored for SMS/WhatsApp but kept on the shape so a company can
    // switch channel without losing its subject line.
    subject: z.string().max(200).default(''),
    body: z.string().max(2000),
});

export type NotificationTemplate = z.infer<typeof templateSchema>;

// Sensible South African English defaults: Rand, "technician", polite plain tone.
export const defaultNotificationTemplates: Record<NotificationEvent, NotificationTemplate> = {
    JOB_BOOKED: {
        enabled: true,
        channel: 'EMAIL',
        subject: 'Your booking with {{companyName}} is confirmed',
        body:
            'Hi {{customerName}},\n\n' +
            "Thanks for booking with {{companyName}}. We've scheduled your job for {{jobDate}}.\n\n" +
            "We'll let you know when our technician is on the way.\n\n" +
            'Kind regards,\n{{companyName}}',
    },
    TECH_EN_ROUTE: {
        enabled: true,
        channel: 'SMS',
        subject: '',
        body:
            // The live-tracking link is appended automatically when there is one.
            'Hi {{customerName}}, your {{companyName}} technician {{technicianName}} is on the way.',
    },
    JOB_COMPLETED: {
        enabled: true,
        channel: 'EMAIL',
        subject: 'Your job with {{companyName}} is complete',
        body:
            'Hi {{customerName}},\n\n' +
            'Good news — {{technicianName}} has completed your job (ref {{reference}}). ' +
            'Thank you for choosing {{companyName}}.\n\n' +
            'If you have any questions, just reply to this message.\n\n' +
            'Kind regards,\n{{companyName}}',
    },
    INVOICE_SENT: {
        enabled: true,
        channel: 'EMAIL',
        subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
        body:
            'Hi {{customerName}},\n\n' +
            'Please find invoice {{invoiceNumber}} for {{amountDue}}, due by {{dueDate}}.\n\n' +
            'You can view and pay it here: {{payUrl}}\n\n' +
            'Thank you for your business,\n{{companyName}}',
    },
    QUOTE_SENT: {
        enabled: true,
        channel: 'EMAIL',
        subject: 'Your quote {{quoteNumber}} from {{companyName}}',
        body:
            'Hi {{customerName}},\n\n' +
            'Thank you for the opportunity to quote. Your quote {{quoteNumber}} comes to {{quoteTotal}}.\n\n' +
            'You can review and accept it here: {{quoteUrl}}\n\n' +
            'Please let us know if you have any questions.\n\n' +
            'Kind regards,\n{{companyName}}',
    },
};

const templatesShape = NOTIFICATION_EVENTS.reduce(
    (acc, event) => {
        acc[event] = templateSchema.default(defaultNotificationTemplates[event]);
        return acc;
    },
    {} as Record<NotificationEvent, z.ZodDefault<typeof templateSchema>>
);

export const notificationSettingsSchema = z
    .object({
        // Master gate. ON by default: existing companies keep their lifecycle messages.
        enabled: z.boolean().default(true),
        templates: z.object(templatesShape).default({} as any),
    })
    .default({} as any);

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const defaultNotificationSettings: NotificationSettings = {
    enabled: true,
    templates: defaultNotificationTemplates,
};

// Same interpolation the dunning templates use: {{token}} replaced from vars,
// unknown tokens collapse to empty string.
const interpolate = (s: string, vars: Record<string, string | number>) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * Render a single template against supplied variables. Triggers that already
 * hold the template (and have checked the gates) can call this directly.
 */
export function renderNotificationTemplate(
    template: NotificationTemplate,
    vars: Record<string, string | number>
): { channel: NotificationChannel; subject: string; body: string } {
    return {
        channel: template.channel,
        subject: interpolate(template.subject ?? '', vars),
        body: interpolate(template.body, vars),
    };
}

/**
 * The entry point for send-on-event triggers. Enforces the master gate and the
 * per-event enabled flag, so callers don't each re-implement that check.
 * Returns null when nothing should be sent.
 */
export function renderNotificationForEvent(
    settings: NotificationSettings,
    event: NotificationEvent,
    vars: Record<string, string | number>
): { channel: NotificationChannel; subject: string; body: string } | null {
    if (!settings?.enabled) return null;
    const template = settings.templates?.[event];
    if (!template || !template.enabled) return null;
    return renderNotificationTemplate(template, vars);
}

// Earlier shipped default bodies (they used placeholders no trigger could fill).
// A company that saved one of these unedited still counts as being on the default.
const LEGACY_DEFAULT_BODIES: Partial<Record<NotificationEvent, string[]>> = {
    JOB_BOOKED: [
        'Hi {{customerName}},\n\n' +
            "Thanks for booking with {{companyName}}. We've scheduled your job for {{jobDate}} at {{jobTime}}.\n\n" +
            'Address: {{serviceAddress}}\n' +
            'Reference: {{reference}}\n\n' +
            "We'll let you know when our technician is on the way.\n\n" +
            'Kind regards,\n{{companyName}}',
    ],
    TECH_EN_ROUTE: [
        'Hi {{customerName}}, your {{companyName}} technician {{technicianName}} is on the way ' +
            'and should arrive in about {{etaMinutes}} minutes.',
    ],
};

/** True when a stored template is still the shipped default (no company edits). */
export function isDefaultNotificationTemplate(
    event: NotificationEvent,
    template: NotificationTemplate
): boolean {
    const def = defaultNotificationTemplates[event];
    const bodyIsDefault =
        template.body === def.body || (LEGACY_DEFAULT_BODIES[event] ?? []).includes(template.body);
    return template.channel === def.channel && (template.subject ?? '') === def.subject && bodyIsDefault;
}
