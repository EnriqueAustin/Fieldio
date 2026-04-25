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
        paymentTermsDays: number;
        paymentMethods: {
            cardEnabled: boolean;
            eftEnabled: boolean;
            cashEnabled: boolean;
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
    };
    contact: {
        phone?: string;
        email?: string;
        website?: string;
    };
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
        paymentTermsDays: 7,
        paymentMethods: {
            cardEnabled: true,
            eftEnabled: true,
            cashEnabled: true,
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
    },
    contact: {
        phone: '',
        email: '',
        website: '',
    },
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
        },
        contact: {
            phone: merged.contact.phone ?? '',
            email: merged.contact.email ?? '',
            website: merged.contact.website ?? '',
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
