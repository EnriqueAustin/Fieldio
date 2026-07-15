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
