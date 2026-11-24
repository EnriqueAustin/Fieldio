// Client-side CSV export.
//
// Mirrors the parser in `customers/import/page.tsx`: a field is quoted only when
// it contains a comma, double-quote or CR/LF, and an embedded `"` is doubled to
// `""`. Rows are joined with CRLF and the download is prefixed with a UTF-8 BOM,
// so what we emit round-trips back through that importer and Excel reads Rand
// symbols and accented names correctly.

/** A single output column: a header and a function producing the raw cell value. */
export interface CsvColumn<Row> {
    header: string;
    value: (row: Row) => string | number | null | undefined;
}

/** Quote one field per RFC-4180. */
function escapeField(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build an RFC-4180 CSV string: header row plus one row per record, CRLF line
 * endings, no BOM. Pure and unit-testable — the BOM and download live in
 * `downloadCsv`.
 */
export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
    const lines = [columns.map((c) => escapeField(c.header)).join(",")];
    for (const row of rows) {
        lines.push(columns.map((c) => escapeField(c.value(row))).join(","));
    }
    return lines.join("\r\n");
}

/** Money for spreadsheets: a plain decimal, no "R" and no thousands separator. */
export function csvMoney(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "";
}

/** Date as ISO `YYYY-MM-DD`; blank for missing or unparseable values. */
export function csvDate(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** A filesystem-safe lowercase slug for a filename segment. */
export function csvSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Build a CSV from `columns` + `rows` and trigger a browser download. Prepends a
 * UTF-8 BOM. `filename` gains a `.csv` extension if it lacks one. No-op outside
 * the browser.
 */
export function downloadCsv<Row>(filename: string, columns: CsvColumn<Row>[], rows: Row[]): void {
    if (typeof document === "undefined") return;
    const csv = "﻿" + toCsv(columns, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
