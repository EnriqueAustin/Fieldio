// Client-side VAT math for quote previews. The server is authoritative (see
// apps/api estimates.service.ts); this mirrors it so the create dialog can show
// a live Subtotal / VAT / Total breakdown before the quote is saved.
//
// Price-book prices and line totals are VAT-exclusive. A business with no VAT
// number is not VAT-registered and must not charge VAT.

export interface VatSettings {
    taxRate: number;
    taxLabel: string;
    taxNumber?: string | null;
}

export interface VatBreakdown {
    subtotal: number;
    tax: number;
    taxRate: number;
    taxLabel: string | null;
    total: number;
    vatRegistered: boolean;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeVat(subtotal: number, settings: VatSettings | undefined | null): VatBreakdown {
    const sub = round2(subtotal);
    const registered = !!settings?.taxNumber && String(settings.taxNumber).trim().length > 0;
    if (!registered || !settings) {
        return { subtotal: sub, tax: 0, taxRate: 0, taxLabel: null, total: sub, vatRegistered: false };
    }
    const taxRate = settings.taxRate;
    const tax = round2((sub * taxRate) / 100);
    return {
        subtotal: sub,
        tax,
        taxRate,
        taxLabel: settings.taxLabel,
        total: round2(sub + tax),
        vatRegistered: true,
    };
}
