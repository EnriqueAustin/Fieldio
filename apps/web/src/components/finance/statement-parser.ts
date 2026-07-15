// Client-side parsing of pasted bank-statement lines / uploaded CSV into
// { date, amount, reference } rows for the bulk EFT matcher.
//
// Bank exports vary wildly (FNB/Standard Bank/ABSA/Nedbank CSVs, or lines
// pasted straight from internet banking), so this is deliberately forgiving:
// per line we take the first date-looking token, the last positive
// amount-looking token, and everything else becomes the reference narrative.

export interface StatementLine {
    date?: string;
    amount: number;
    reference?: string;
}

const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/;

// "1 234,56", "1,234.56", "R 1234.56", "1234.56", "(120.00)"
function parseAmount(token: string): number | null {
    let t = token.trim().replace(/^R\s?/i, "");
    const negative = /^\(.*\)$/.test(t) || t.startsWith("-");
    t = t.replace(/[()\s-]/g, "");
    if (!t) return null;
    // Decide decimal separator: last of "." or ","
    const lastDot = t.lastIndexOf(".");
    const lastComma = t.lastIndexOf(",");
    if (lastComma > lastDot) {
        t = t.replace(/\./g, "").replace(",", ".");
    } else {
        t = t.replace(/,/g, "");
    }
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return negative ? null : n; // debits/negatives are not customer payments
}

export function parseStatementText(text: string): { lines: StatementLine[]; skipped: number } {
    const rawLines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    const lines: StatementLine[] = [];
    let skipped = 0;

    for (const [i, raw] of rawLines.entries()) {
        // Header row of a CSV — skip if it has no digits at all.
        if (i === 0 && !/\d/.test(raw)) continue;

        const tokens = raw.split(/[\t;,]|\s{2,}/).map((t) => t.trim()).filter(Boolean);
        // Fall back to whitespace splitting for plain pasted lines.
        const parts = tokens.length > 1 ? tokens : raw.split(/\s+/).filter(Boolean);

        let date: string | undefined;
        let amount: number | null = null;
        const refParts: string[] = [];

        // Scan from the right for the amount (bank lines usually end with it).
        let amountIdx = -1;
        for (let j = parts.length - 1; j >= 0; j--) {
            const a = parseAmount(parts[j]);
            if (a !== null) {
                amount = a;
                amountIdx = j;
                break;
            }
        }

        for (let j = 0; j < parts.length; j++) {
            if (j === amountIdx) continue;
            if (!date && DATE_RE.test(parts[j])) {
                date = parts[j];
                continue;
            }
            refParts.push(parts[j]);
        }

        if (amount === null) {
            skipped++;
            continue;
        }
        lines.push({ date, amount, reference: refParts.join(" ") || undefined });
    }

    return { lines, skipped };
}
