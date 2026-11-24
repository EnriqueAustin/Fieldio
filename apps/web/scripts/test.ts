import assert from 'node:assert/strict';
import {
    defaultCompanySettings,
    formatCurrency,
    normalizeCompanySettings,
} from '../src/lib/company-settings.ts';
import { toCsv, csvMoney, csvDate, csvSlug, type CsvColumn } from '../src/lib/csv.ts';

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

run('toCsv emits a header row and CRLF line endings', () => {
    const cols: CsvColumn<{ a: string; b: number }>[] = [
        { header: 'A', value: (r) => r.a },
        { header: 'B', value: (r) => r.b },
    ];
    const out = toCsv(cols, [{ a: 'x', b: 1 }, { a: 'y', b: 2 }]);
    assert.equal(out, 'A,B\r\nx,1\r\ny,2');
});

run('toCsv quotes fields with commas, quotes and newlines (escaping " as "")', () => {
    const cols: CsvColumn<{ v: string }>[] = [{ header: 'V', value: (r) => r.v }];
    assert.equal(toCsv(cols, [{ v: 'a,b' }]), 'V\r\n"a,b"');
    assert.equal(toCsv(cols, [{ v: 'say "hi"' }]), 'V\r\n"say ""hi"""');
    assert.equal(toCsv(cols, [{ v: 'line1\nline2' }]), 'V\r\n"line1\nline2"');
});

run('toCsv renders null/undefined as empty and prepends no BOM', () => {
    const cols: CsvColumn<{ v: string | null }>[] = [{ header: 'V', value: (r) => r.v }];
    const out = toCsv(cols, [{ v: null }]);
    assert.equal(out, 'V\r\n');
    assert.notEqual(out.charCodeAt(0), 0xfeff);
});

run('csvMoney is a plain decimal with no symbol or thousands separator', () => {
    assert.equal(csvMoney(1234.5), '1234.50');
    assert.equal(csvMoney('2000'), '2000.00');
    assert.equal(csvMoney(null), '');
    assert.equal(csvMoney(''), '');
});

run('csvDate formats to ISO YYYY-MM-DD and blanks invalid input', () => {
    assert.equal(csvDate('2026-07-15T09:30:00.000Z'), '2026-07-15');
    assert.equal(csvDate(null), '');
    assert.equal(csvDate('not a date'), '');
});

run('csvSlug makes a filesystem-safe lowercase segment', () => {
    assert.equal(csvSlug('Paid & Overdue'), 'paid-overdue');
    assert.equal(csvSlug('  VAT 15% '), 'vat-15');
});
