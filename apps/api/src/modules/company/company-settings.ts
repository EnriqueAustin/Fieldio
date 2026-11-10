import { z } from 'zod';

export const companySettingsSchema = z.object({
    regional: z.object({
        homeMarket: z.enum(['ZA', 'INTERNATIONAL']).default('ZA'),
        locale: z.string().default('en-ZA'),
        timezone: z.string().default('Africa/Johannesburg'),
        currency: z.string().default('ZAR'),
    }).default({}),
    billing: z.object({
        taxLabel: z.string().default('VAT'),
        taxRate: z.number().min(0).max(100).default(15),
        taxNumber: z.string().optional().nullable(),
        invoiceHeading: z.string().default('Tax Invoice'),
        // Prefix for generated invoice numbers (e.g. INV-0001). Read by the
        // invoice numbering service. Upper-case letters and digits only.
        invoicePrefix: z.string().regex(/^[A-Z0-9]{1,10}$/).default('INV'),
        companyRegistrationNumber: z.string().optional().nullable(),
        paymentTermsDays: z.number().int().min(0).max(365).default(7),
        paymentMethods: z.object({
            cardEnabled: z.boolean().default(true),
            eftEnabled: z.boolean().default(true),
            cashEnabled: z.boolean().default(true),
            payFastEnabled: z.boolean().default(false),
        }).default({}),
        eftDetails: z.object({
            bankName: z.string().optional().nullable(),
            accountName: z.string().optional().nullable(),
            accountNumber: z.string().optional().nullable(),
            branchCode: z.string().optional().nullable(),
            accountType: z.string().optional().nullable(),
            referencePrefix: z.string().optional().nullable(),
            paymentInstructions: z.string().optional().nullable(),
        }).default({}),
        payFast: z.object({
            merchantId: z.string().optional().nullable(),
            merchantKey: z.string().optional().nullable(),
            passphrase: z.string().optional().nullable(),
            sandbox: z.boolean().default(true),
        }).default({}),
    }).default({}),
    integrations: z.object({
        xero: z.object({
            enabled: z.boolean().default(false),
            tenantId: z.string().optional().nullable(),
            tenantName: z.string().optional().nullable(),
            syncContacts: z.boolean().default(true),
            syncInvoices: z.boolean().default(true),
        }).default({}),
        whatsapp: z.object({
            enabled: z.boolean().default(false),
            businessNumber: z.string().optional().nullable(),
        }).default({}),
    }).default({}),
    reviews: z.object({
        enabled: z.boolean().default(false),
        googleReviewUrl: z.string().optional().nullable(),
        delayHours: z.number().int().min(0).max(168).default(2),
        autoSendSms: z.boolean().default(true),
        autoSendEmail: z.boolean().default(true),
        autoSendWhatsapp: z.boolean().default(true),
    }).default({}),
    // Field quoting is OFF by default: most companies price from the office and
    // technicians never see pricing. Companies that trust techs to quote on site
    // can opt in, which unlocks POST /finance/estimates/field for the TECHNICIAN role.
    fieldQuoting: z.object({
        enabled: z.boolean().default(false),
    }).default({}),
    contact: z.object({
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        website: z.string().optional().nullable(),
    }).default({}),
    commission: z.object({
        enabled: z.boolean().default(false),
        type: z.enum(['flat', 'percentage']).default('flat'),
        flatAmount: z.number().min(0).default(0),
        percentageRate: z.number().min(0).max(100).default(0),
    }).default({}),
    memberships: z.object({
        enabled: z.boolean().default(false),
        showOnPortal: z.boolean().default(true),
        autoRenewDefault: z.boolean().default(true),
    }).default({}),
    campaigns: z.object({
        enabled: z.boolean().default(false),
        unsoldEstimateFollowup: z.object({
            enabled: z.boolean().default(false),
            delayDays: z.number().int().min(1).max(90).default(7),
        }).default({}),
        serviceAnniversary: z.object({
            enabled: z.boolean().default(false),
            monthsSince: z.number().int().min(1).max(24).default(12),
        }).default({}),
    }).default({}),
    permits: z.object({
        enabled: z.boolean().default(false),
        requireForJobTypes: z.array(z.string()).default([]),
    }).default({}),
    financing: z.object({
        enabled: z.boolean().default(false),
        showOnEstimates: z.boolean().default(true),
        provider: z.string().optional().nullable(),
    }).default({}),
    // Customer self-service from the portal link. Rescheduling moves a booked
    // job on the dispatch board without the office, so it is OFF by default.
    portal: z.object({
        selfReschedule: z.object({
            enabled: z.boolean().default(false),
            minNoticeHours: z.number().int().min(0).max(168).default(24),
            dayStartHour: z.number().int().min(0).max(23).default(8),
            dayEndHour: z.number().int().min(1).max(24).default(17),
            workDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
            horizonDays: z.number().int().min(1).max(60).default(14),
            maxPerJob: z.number().int().min(1).max(10).default(2),
        }).default({}),
    }).default({}),
    // Optional modules. These toggle only whether a feature appears in the
    // navigation — a small plumbing shop starts with a lean nav and switches on
    // what it needs. Core tools (Dashboard, Schedule, Jobs, Customers, Quotes,
    // Invoices, Vans, Reports, Labour hours, Forms, Settings, Team) are never
    // toggleable and are not listed here. Direct URLs to a hidden module still
    // work; this is a nav concern, not a permission.
    modules: z.object({
        leads: z.boolean().default(false),
        campaigns: z.boolean().default(false),
        memberships: z.boolean().default(false),
        financing: z.boolean().default(false),
        projects: z.boolean().default(false),
        permits: z.boolean().default(false),
        subcontractors: z.boolean().default(false),
        certifications: z.boolean().default(false),
        warrantyClaims: z.boolean().default(false),
        flatRate: z.boolean().default(false),
        suppliers: z.boolean().default(true),
        inventory: z.boolean().default(true),
        calls: z.boolean().default(false),
        inbox: z.boolean().default(true),
        bookings: z.boolean().default(true),
        scoreboard: z.boolean().default(false),
        kpi: z.boolean().default(true),
        dunning: z.boolean().default(false),
        creditNotes: z.boolean().default(true),
        statements: z.boolean().default(true),
        reviews: z.boolean().default(false),
    }).default({}),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;

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
        taxNumber: null,
        invoiceHeading: 'Tax Invoice',
        invoicePrefix: 'INV',
        companyRegistrationNumber: null,
        paymentTermsDays: 7,
        paymentMethods: {
            cardEnabled: true,
            eftEnabled: true,
            cashEnabled: true,
            payFastEnabled: false,
        },
        eftDetails: {
            bankName: null,
            accountName: null,
            accountNumber: null,
            branchCode: null,
            accountType: null,
            referencePrefix: null,
            paymentInstructions: 'Use your invoice number as the payment reference.',
        },
        payFast: {
            merchantId: null,
            merchantKey: null,
            passphrase: null,
            sandbox: true,
        },
    },
    integrations: {
        xero: {
            enabled: false,
            tenantId: null,
            tenantName: null,
            syncContacts: true,
            syncInvoices: true,
        },
        whatsapp: {
            enabled: false,
            businessNumber: null,
        },
    },
    reviews: {
        enabled: false,
        googleReviewUrl: null,
        delayHours: 2,
        autoSendSms: true,
        autoSendEmail: true,
        autoSendWhatsapp: true,
    },
    fieldQuoting: {
        enabled: false,
    },
    contact: {
        phone: null,
        email: null,
        website: null,
    },
    commission: {
        enabled: false,
        type: 'flat' as const,
        flatAmount: 0,
        percentageRate: 0,
    },
    memberships: {
        enabled: false,
        showOnPortal: true,
        autoRenewDefault: true,
    },
    campaigns: {
        enabled: false,
        unsoldEstimateFollowup: {
            enabled: false,
            delayDays: 7,
        },
        serviceAnniversary: {
            enabled: false,
            monthsSince: 12,
        },
    },
    permits: {
        enabled: false,
        requireForJobTypes: [],
    },
    financing: {
        enabled: false,
        showOnEstimates: true,
        provider: null,
    },
    portal: {
        selfReschedule: {
            enabled: false,
            minNoticeHours: 24,
            dayStartHour: 8,
            dayEndHour: 17,
            workDays: [1, 2, 3, 4, 5],
            horizonDays: 14,
            maxPerJob: 2,
        },
    },
    modules: {
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
    },
};

const deepMerge = <T extends Record<string, any>>(base: T, override: Record<string, any>): T => {
    const result: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };

    for (const [key, value] of Object.entries(override)) {
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            base[key] &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            result[key] = deepMerge(base[key], value);
            continue;
        }

        result[key] = value;
    }

    return result as T;
};

export const normalizeCompanySettings = (input: unknown): CompanySettings => {
    const parsed = companySettingsSchema.safeParse(input ?? {});
    const merged = deepMerge(defaultCompanySettings, parsed.success ? parsed.data : {});

    if (merged.regional.homeMarket === 'ZA') {
        merged.regional.currency ||= 'ZAR';
        merged.regional.locale ||= 'en-ZA';
        merged.regional.timezone ||= 'Africa/Johannesburg';
        merged.billing.taxLabel ||= 'VAT';
    }

    return companySettingsSchema.parse(merged);
};

export const mergeCompanySettings = (
    current: unknown,
    next: Partial<CompanySettings> | undefined
): CompanySettings => {
    if (!next) return normalizeCompanySettings(current);
    return normalizeCompanySettings(deepMerge(normalizeCompanySettings(current), next as Record<string, any>));
};
