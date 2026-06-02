import assert from 'node:assert/strict';
import {
    defaultCompanySettings,
    formatCurrency,
    normalizeCompanySettings,
} from '../src/lib/company-settings.ts';

const run = (name: string, fn: () => void) => {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
};

run('normalizeCompanySettings returns defaults for invalid input', () => {
    const settings = normalizeCompanySettings(null);

    assert.deepEqual(settings, defaultCompanySettings);
});

run('normalizeCompanySettings preserves nested overrides and fills missing fields', () => {
    const settings = normalizeCompanySettings({
        billing: {
            taxRate: 0,
            eftDetails: {
                bankName: 'Nedbank',
            },
        },
        contact: {
            email: 'ops@fieldio.app',
        },
    });

    assert.equal(settings.billing.taxRate, 0);
    assert.equal(settings.billing.taxLabel, 'VAT');
    assert.equal(settings.billing.eftDetails.bankName, 'Nedbank');
    assert.equal(
        settings.billing.eftDetails.paymentInstructions,
        'Use your invoice number as the payment reference.'
    );
    assert.equal(settings.contact.email, 'ops@fieldio.app');
    assert.equal(settings.contact.phone, '');
});

run('formatCurrency uses the configured locale and currency', () => {
    const output = formatCurrency(1234.5, {
        regional: {
            locale: 'en-ZA',
            currency: 'ZAR',
            homeMarket: 'ZA',
            timezone: 'Africa/Johannesburg',
        },
    });

    assert.match(output, /R/);
    assert.equal(output.replace(/[^\d]/g, ''), '123450');
});
