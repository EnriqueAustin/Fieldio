"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { toast } from "../../../../components/ui/use-toast";
import { Button } from "../../../../components/ui/button";
import { ArrowLeft, Download, FileUp, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";

// Fields we import, in template order.
const FIELDS = [
    "name",
    "email",
    "phone",
    "notes",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "zip",
] as const;
type Field = (typeof FIELDS)[number];

const FIELD_LABELS: Record<Field, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    notes: "Notes",
    addressLine1: "Address 1",
    addressLine2: "Address 2",
    city: "City",
    state: "Province",
    zip: "Postal Code",
};

// Header text (normalized) → field. Covers common spreadsheet variants.
const HEADER_SYNONYMS: Record<string, Field> = {
    name: "name", customer: "name", customername: "name", fullname: "name", client: "name", company: "name", companyname: "name",
    email: "email", emailaddress: "email", mail: "email", "e-mail": "email",
    phone: "phone", phonenumber: "phone", mobile: "phone", cell: "phone", tel: "phone", telephone: "phone", contact: "phone", contactnumber: "phone",
    notes: "notes", note: "notes", comments: "notes", comment: "notes",
    address: "addressLine1", addressline1: "addressLine1", address1: "addressLine1", street: "addressLine1", streetaddress: "addressLine1", line1: "addressLine1",
    addressline2: "addressLine2", address2: "addressLine2", line2: "addressLine2", unit: "addressLine2", suite: "addressLine2",
    city: "city", town: "city", suburb: "city",
    state: "state", province: "state", region: "state",
    zip: "zip", zipcode: "zip", postalcode: "zip", postcode: "zip", postal: "zip",
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, and CRLF. */
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    // Strip a leading UTF-8 BOM if present.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field); field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            rows.push(row); row = [];
        } else {
            field += c;
        }
    }
    // Flush trailing field/row.
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    // Drop fully-empty rows.
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const TEMPLATE_HEADERS = "name,email,phone,notes,addressLine1,addressLine2,city,state,zip";
const TEMPLATE_SAMPLE = 'Sarah van der Merwe,sarah@example.co.za,082 555 1234,VIP client,12 Oak Ave,,Sandton,Gauteng,2196';

interface ImportResult {
    total: number;
    created: number;
    skipped: number;
    failed: number;
    errors: { row: number; message: string }[];
}

export default function ImportCustomersPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<(Field | "")[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);

    const handleFile = async (file: File) => {
        setResult(null);
        const text = await file.text();
        const parsed = parseCsv(text);
        if (parsed.length < 2) {
            toast({ title: "That file has no data rows", variant: "destructive" });
            return;
        }
        const [hdr, ...body] = parsed;
        setFileName(file.name);
        setHeaders(hdr);
        setRows(body);
        // Auto-map each column to a field by its header.
        setMapping(hdr.map((h) => HEADER_SYNONYMS[normalizeHeader(h)] ?? ""));
    };

    // Build mapped record objects; a row is valid if it has a non-empty name.
    const mappedRows = useMemo(() => {
        const nameCol = mapping.indexOf("name");
        return rows.map((cells) => {
            const rec: Record<string, string> = {};
            mapping.forEach((field, col) => {
                if (field) rec[field] = (cells[col] ?? "").trim();
            });
            return rec;
        }).filter((_, i) => nameCol === -1 ? false : (rows[i][nameCol] ?? "").trim() !== "");
    }, [rows, mapping]);

    const hasNameMapped = mapping.includes("name");
    const droppedNoName = hasNameMapped ? rows.length - mappedRows.length : rows.length;

    const downloadTemplate = () => {
        const blob = new Blob([`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}\n`], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "customer-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const runImport = async () => {
        if (!hasNameMapped) {
            toast({ title: "Map a column to Name first", variant: "destructive" });
            return;
        }
        if (mappedRows.length === 0) {
            toast({ title: "No valid rows to import", variant: "destructive" });
            return;
        }
        setImporting(true);
        try {
            const res = await api.post("/customers/import", { rows: mappedRows });
            const data: ImportResult = res.data.data;
            setResult(data);
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            toast({ title: `Imported ${data.created} customer${data.created === 1 ? "" : "s"}` });
        } catch (e: any) {
            toast({ title: e?.response?.data?.message || "Import failed", variant: "destructive" });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/customers" className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="page-title">Import Customers</h1>
                    <p className="page-subtitle">Bulk-add customers from a CSV spreadsheet.</p>
                </div>
            </div>

            {/* Step 1: file */}
            <div className="surface-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="font-medium">1. Upload a CSV file</h2>
                        <p className="text-sm text-muted-foreground">One row per customer. Only a name is required.</p>
                    </div>
                    <button
                        onClick={downloadTemplate}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                    >
                        <Download className="h-4 w-4" />
                        Download template
                    </button>
                </div>

                <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFile(f);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 cursor-pointer hover:border-slate-400 transition"
                >
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">{fileName ?? "Click to choose a file, or drag it here"}</p>
                    <p className="text-xs text-muted-foreground">.csv up to 2000 rows</p>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                        }}
                    />
                </div>
            </div>

            {/* Step 2: mapping + preview */}
            {headers.length > 0 && (
                <div className="surface-card p-5 space-y-4">
                    <div>
                        <h2 className="font-medium">2. Match your columns</h2>
                        <p className="text-sm text-muted-foreground">
                            We matched columns by their header — adjust any that are wrong.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {headers.map((h, col) => (
                            <div key={col} className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground truncate block" title={h}>
                                    {h || `Column ${col + 1}`}
                                </label>
                                <select
                                    value={mapping[col] ?? ""}
                                    onChange={(e) => {
                                        const next = [...mapping];
                                        next[col] = e.target.value as Field | "";
                                        setMapping(next);
                                    }}
                                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                                >
                                    <option value="">— Ignore —</option>
                                    {FIELDS.map((f) => (
                                        <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {!hasNameMapped && (
                        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <AlertTriangle className="h-4 w-4" />
                            Map one column to <strong>Name</strong> to continue.
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span><strong className="text-foreground">{mappedRows.length}</strong> ready to import</span>
                        {droppedNoName > 0 && <span>{droppedNoName} skipped (no name)</span>}
                    </div>

                    {/* Preview first 8 mapped rows */}
                    {mappedRows.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-slate-50/60">
                                        {FIELDS.filter((f) => mapping.includes(f)).map((f) => (
                                            <th key={f} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                                                {FIELD_LABELS[f]}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {mappedRows.slice(0, 8).map((r, i) => (
                                        <tr key={i}>
                                            {FIELDS.filter((f) => mapping.includes(f)).map((f) => (
                                                <td key={f} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">{r[f] || "—"}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {mappedRows.length > 8 && (
                                <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60">
                                    …and {mappedRows.length - 8} more
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button onClick={runImport} disabled={importing || !hasNameMapped || mappedRows.length === 0}>
                            <Upload className="h-4 w-4 mr-2" />
                            {importing ? "Importing…" : `Import ${mappedRows.length} customer${mappedRows.length === 1 ? "" : "s"}`}
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 3: result */}
            {result && (
                <div className="surface-card p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <h2 className="font-medium">Import complete</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <Stat label="Rows" value={result.total} />
                        <Stat label="Created" value={result.created} tone="emerald" />
                        <Stat label="Skipped (duplicate)" value={result.skipped} tone="amber" />
                        <Stat label="Failed" value={result.failed} tone={result.failed > 0 ? "rose" : undefined} />
                    </div>

                    {result.errors.length > 0 && (
                        <div className="rounded-lg border border-border overflow-hidden">
                            <div className="bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">Rows that couldn&apos;t be imported</div>
                            <ul className="divide-y divide-border/60 text-sm max-h-64 overflow-y-auto">
                                {result.errors.map((err, i) => (
                                    <li key={i} className="px-3 py-2 flex gap-3">
                                        <span className="text-muted-foreground shrink-0">Row {err.row}</span>
                                        <span>{err.message}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => { setResult(null); setFileName(null); setHeaders([]); setRows([]); setMapping([]); }}>
                            Import another file
                        </Button>
                        <Button onClick={() => router.push("/customers")}>View customers</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" }) {
    const color =
        tone === "emerald" ? "text-emerald-600" :
        tone === "amber" ? "text-amber-600" :
        tone === "rose" ? "text-rose-600" : "text-foreground";
    return (
        <div className="rounded-lg border border-border p-3">
            <p className={`text-2xl font-semibold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
        </div>
    );
}
