export type CompanySettings = {
    regional: {
        homeMarket: 'ZA' | 'INTERNATIONAL';
        locale: string;
        timezone: string;
        currency: string;
    };
    billing: {
        taxLabel: string;
        taxRate: number;
        taxNumber?: string;
        invoiceHeading: string;
        invoicePrefix: string;
        companyRegistrationNumber?: string;
        paymentTermsDays: number;
        paymentMethods: {
            cardEnabled: boolean;
            eftEnabled: boolean;
            cashEnabled: boolean;
            payFastEnabled: boolean;
        };
        eftDetails: {
            bankName?: string;
            accountName?: string;
            accountNumber?: string;
            branchCode?: string;
            accountType?: string;
            referencePrefix?: string;
            paymentInstructions?: string;
        };
        payFast: {
            merchantId?: string;
            merchantKey?: string;
            passphrase?: string;
            sandbox: boolean;
        };
    };
    integrations: {
        xero: {
            enabled: boolean;
            tenantId?: string;
            tenantName?: string;
            syncContacts: boolean;
            syncInvoices: boolean;
        };
        whatsapp: {
            enabled: boolean;
            businessNumber?: string;
        };
    };
    contact: {
        phone?: string;
        email?: string;
        website?: string;
    };
    fieldQuoting: {
        enabled: boolean;
    };
    financing: {
        enabled: boolean;
        showOnEstimates: boolean;
    };
    businessHours: BusinessHours;
    notifications: NotificationSettings;
    portal: {
        selfReschedule: {
            enabled: boolean;
            minNoticeHours: number;
        };
    };
    modules: CompanyModules;
};

// Per-day operating window. `start`/`end` are "HH:MM" 24-hour strings and are
// kept even when the day is closed. Mirrors apps/api company-settings.ts.
export type DayHours = {
    open: boolean;
    start: string;
    end: string;
};

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type BusinessHours = Record<DayKey, DayHours>;

export const defaultBusinessHours: BusinessHours = {
    mon: { open: true, start: '08:00', end: '17:00' },
    tue: { open: true, start: '08:00', end: '17:00' },
    wed: { open: true, start: '08:00', end: '17:00' },
    thu: { open: true, start: '08:00', end: '17:00' },
    fri: { open: true, start: '08:00', end: '17:00' },
    sat: { open: true, start: '08:00', end: '13:00' },
    sun: { open: false, start: '08:00', end: '17:00' },
};

// The master `enabled` gate is ON by default: core lifecycle messages keep sending unless a company opts out.
export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENT_KEYS = [
    'JOB_BOOKED',
    'TECH_EN_ROUTE',
    'JOB_COMPLETED',
    'INVOICE_SENT',
    'QUOTE_SENT',
] as const;
export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export type NotificationTemplate = {
    enabled: boolean;
    channel: NotificationChannel;
    subject: string;
    body: string;
};

export type NotificationSettings = {
    enabled: boolean;
    templates: Record<NotificationEventKey, NotificationTemplate>;
};

// Presentation metadata for the settings page: human labels and the placeholder
// tokens a trigger supplies. Placeholder syntax matches the dunning templates:
// {{token}}.
export const NOTIFICATION_EVENTS: {
    key: NotificationEventKey;
    label: string;
    description: string;
    placeholders: string[];
}[] = [
    {
        key: 'JOB_BOOKED',
        label: 'Job booked',
        description: 'Sent to the customer when a new job is booked.',
        placeholders: ['customerName', 'companyName', 'jobDate'],
    },
    {
        key: 'TECH_EN_ROUTE',
        label: 'Technician en route',
        description: 'Sent when the technician is on the way.',
        placeholders: ['customerName', 'companyName', 'technicianName', 'trackingUrl'],
    },
    {
        key: 'JOB_COMPLETED',
        label: 'Job completed',
        description: 'Sent when the job is marked complete.',
        placeholders: ['customerName', 'companyName', 'technicianName', 'reference'],
    },
    {
        key: 'INVOICE_SENT',
        label: 'Invoice sent',
        description: 'Sent when an invoice is issued to the customer.',
        placeholders: ['customerName', 'companyName', 'invoiceNumber', 'amountDue', 'dueDate', 'payUrl'],
    },
    {
        key: 'QUOTE_SENT',
        label: 'Quote sent',
        description: 'Sent when a quote is sent to the customer.',
        placeholders: ['customerName', 'companyName', 'quoteNumber', 'quoteTotal', 'quoteUrl'],
    },
];

export const defaultNotificationTemplates: Record<NotificationEventKey, NotificationTemplate> = {
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

export const defaultNotificationSettings: NotificationSettings = {
    enabled: true,
    templates: defaultNotificationTemplates,
};

// Optional modules. Each toggles only whether a feature shows in the navigation;
// core tools are never listed here. Mirrors apps/api company-settings.ts exactly.
export type ModuleKey =
    | 'leads'
    | 'campaigns'
    | 'memberships'
    | 'financing'
    | 'projects'
    | 'permits'
    | 'subcontractors'
    | 'certifications'
    | 'warrantyClaims'
    | 'flatRate'
    | 'suppliers'
    | 'inventory'
    | 'calls'
    | 'inbox'
    | 'bookings'
    | 'scoreboard'
    | 'kpi'
    | 'dunning'
    | 'creditNotes'
    | 'statements'
    | 'reviews';

export type CompanyModules = Record<ModuleKey, boolean>;

export const defaultModules: CompanyModules = {
    leads: false,
    campaigns: false,
    memberships: false,
    financing: false,
    projects: false,
    permits: false,
    subcontractors: false,
    certifications: false,
    warrantyClaims: false,
    flatRate: false,
    suppliers: true,
    inventory: true,
    calls: false,
    inbox: true,
    bookings: true,
    scoreboard: false,
    kpi: true,
    dunning: false,
    creditNotes: true,
    statements: true,
    reviews: false,
};

export const defaultCompanySettings: CompanySettings = {
    regional: {
        homeMarket: 'ZA',
        locale: 'en-ZA',
        timezone: 'Africa/Johannesburg',
        currency: 'ZAR',
    },
    billing: {
        taxLabel: 'VAT',
        taxRate: 15,
        taxNumber: '',
        invoiceHeading: 'Tax Invoice',
        invoicePrefix: 'INV',
        companyRegistrationNumber: '',
        paymentTermsDays: 7,
        paymentMethods: {
            cardEnabled: true,
            eftEnabled: true,
            cashEnabled: true,
            payFastEnabled: false,
        },
        eftDetails: {
            bankName: '',
            accountName: '',
            accountNumber: '',
            branchCode: '',
            accountType: '',
            referencePrefix: '',
            paymentInstructions: 'Use your invoice number as the payment reference.',
        },
        payFast: {
            merchantId: '',
            merchantKey: '',
            passphrase: '',
            sandbox: true,
        },
    },
    integrations: {
        xero: {
            enabled: false,
            tenantId: '',
            tenantName: '',
            syncContacts: true,
            syncInvoices: true,
        },
        whatsapp: {
            enabled: false,
            businessNumber: '',
        },
    },
    contact: {
        phone: '',
        email: '',
        website: '',
    },
    fieldQuoting: {
        enabled: false,
    },
    businessHours: defaultBusinessHours,
    notifications: defaultNotificationSettings,
    financing: {
        enabled: false,
        showOnEstimates: true,
    },
    portal: {
        selfReschedule: {
            enabled: false,
            minNoticeHours: 24,
        },
    },
    modules: defaultModules,
};

const isRecord = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const deepMerge = <T extends Record<string, any>>(base: T, override: Record<string, any>): T => {
    const result: Record<string, any> = { ...base };

    for (const [key, value] of Object.entries(override)) {
        if (isRecord(value) && isRecord(base[key])) {
            result[key] = deepMerge(base[key], value);
            continue;
        }

        result[key] = value;
    }

    return result as T;
};

export const normalizeCompanySettings = (input: unknown): CompanySettings => {
    if (!isRecord(input)) return defaultCompanySettings;
    const merged = deepMerge(defaultCompanySettings, input);

    return {
        ...merged,
        billing: {
            ...merged.billing,
            taxNumber: merged.billing.taxNumber ?? '',
            invoiceHeading: merged.billing.invoiceHeading ?? defaultCompanySettings.billing.invoiceHeading,
            invoicePrefix: merged.billing.invoicePrefix ?? defaultCompanySettings.billing.invoicePrefix,
            companyRegistrationNumber: merged.billing.companyRegistrationNumber ?? '',
            paymentMethods: {
                ...defaultCompanySettings.billing.paymentMethods,
                ...merged.billing.paymentMethods,
            },
            eftDetails: {
                ...merged.billing.eftDetails,
                bankName: merged.billing.eftDetails.bankName ?? '',
                accountName: merged.billing.eftDetails.accountName ?? '',
                accountNumber: merged.billing.eftDetails.accountNumber ?? '',
                branchCode: merged.billing.eftDetails.branchCode ?? '',
                accountType: merged.billing.eftDetails.accountType ?? '',
                referencePrefix: merged.billing.eftDetails.referencePrefix ?? '',
                paymentInstructions:
                    merged.billing.eftDetails.paymentInstructions ??
                    defaultCompanySettings.billing.eftDetails.paymentInstructions,
            },
            payFast: {
                ...defaultCompanySettings.billing.payFast,
                ...merged.billing.payFast,
                merchantId: merged.billing.payFast?.merchantId ?? '',
                merchantKey: merged.billing.payFast?.merchantKey ?? '',
                passphrase: merged.billing.payFast?.passphrase ?? '',
                sandbox: merged.billing.payFast?.sandbox ?? true,
            },
        },
        integrations: {
            xero: {
                ...defaultCompanySettings.integrations.xero,
                ...merged.integrations?.xero,
                tenantId: merged.integrations?.xero?.tenantId ?? '',
                tenantName: merged.integrations?.xero?.tenantName ?? '',
            },
            whatsapp: {
                ...defaultCompanySettings.integrations.whatsapp,
                ...merged.integrations?.whatsapp,
                businessNumber: merged.integrations?.whatsapp?.businessNumber ?? '',
            },
        },
        contact: {
            phone: merged.contact.phone ?? '',
            email: merged.contact.email ?? '',
            website: merged.contact.website ?? '',
        },
        fieldQuoting: {
            enabled: merged.fieldQuoting?.enabled ?? false,
        },
        businessHours: (Object.keys(defaultBusinessHours) as DayKey[]).reduce((acc, day) => {
            acc[day] = {
                ...defaultBusinessHours[day],
                ...(merged.businessHours?.[day] ?? {}),
            };
            return acc;
        }, {} as BusinessHours),
        notifications: {
            enabled: merged.notifications?.enabled ?? true,
            templates: NOTIFICATION_EVENT_KEYS.reduce((acc, key) => {
                acc[key] = {
                    ...defaultNotificationTemplates[key],
                    ...(merged.notifications?.templates?.[key] ?? {}),
                };
                return acc;
            }, {} as Record<NotificationEventKey, NotificationTemplate>),
        },
        financing: {
            enabled: merged.financing?.enabled ?? false,
            showOnEstimates: merged.financing?.showOnEstimates ?? true,
        },
        portal: {
            selfReschedule: {
                enabled: merged.portal?.selfReschedule?.enabled ?? false,
                minNoticeHours: merged.portal?.selfReschedule?.minNoticeHours ?? 24,
            },
        },
        modules: {
            ...defaultModules,
            ...merged.modules,
        },
    };
};

export const formatCurrency = (
    amount: number,
    settings: Pick<CompanySettings, 'regional'>
) =>
    new Intl.NumberFormat(settings.regional.locale, {
        style: 'currency',
        currency: settings.regional.currency,
        maximumFractionDigits: 2,
    }).format(amount);
