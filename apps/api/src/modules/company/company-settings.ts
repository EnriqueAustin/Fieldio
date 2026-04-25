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
        paymentTermsDays: z.number().int().min(0).max(365).default(7),
        paymentMethods: z.object({
            cardEnabled: z.boolean().default(true),
            eftEnabled: z.boolean().default(true),
            cashEnabled: z.boolean().default(true),
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
    }).default({}),
    contact: z.object({
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        website: z.string().optional().nullable(),
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
        paymentTermsDays: 7,
        paymentMethods: {
            cardEnabled: true,
            eftEnabled: true,
            cashEnabled: true,
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
    },
    contact: {
        phone: null,
        email: null,
        website: null,
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
