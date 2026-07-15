"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Banknote, Loader2, Upload, AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";
import { parseStatementText, type StatementLine } from "./statement-parser";

interface InvoiceCandidate {
    id: string;
    invoiceNumber: string | null;
    paymentReference: string | null;
    customerName: string | null;
    balance: number;
    status: string;
}

interface MatchedRow {
    index: number;
    line: StatementLine;
    invoice: InvoiceCandidate;
    confidence: "reference" | "amount";
    amountMismatch: boolean;
}

interface AmbiguousRow {
    index: number;
    line: StatementLine;
    reason: string;
    candidates: InvoiceCandidate[];
}

interface UnmatchedRow {
    index: number;
    line: StatementLine;
}

interface MatchResult {
    matched: MatchedRow[];
    ambiguous: AmbiguousRow[];
    unmatched: UnmatchedRow[];
    openInvoiceCount: number;
}

function fmt(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

/**
 * "Record EFT batch" flow (G-3): paste bank-statement lines or upload a CSV,
 * dry-run match against open invoices, review/adjust, then apply.
 */
export function EftBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const qc = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [skipped, setSkipped] = useState(0);
    const [result, setResult] = useState<MatchResult | null>(null);
    // Confirmed selections: matched rows can be deselected; ambiguous rows resolved to a candidate.
    const [accepted, setAccepted] = useState<Record<number, boolean>>({});
    const [resolved, setResolved] = useState<Record<number, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<{ recorded: number; failed: number } | null>(null);

    const reset = () => {
        setText("");
        setSkipped(0);
        setResult(null);
        setAccepted({});
        setResolved({});
        setError(null);
        setDone(null);
    };

    const close = (v: boolean) => {
        if (!v) reset();
        onOpenChange(v);
    };

    const match = useMutation({
        mutationFn: (lines: StatementLine[]) =>
            api.post("/finance/payments/bulk-match", { lines }).then((r) => r.data.data as MatchResult),
        onSuccess: (data) => {
            setResult(data);
            setAccepted(Object.fromEntries(data.matched.map((m) => [m.index, !m.amountMismatch])));
            setResolved({});
            setError(null);
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not match statement lines"),
    });

    const record = useMutation({
        mutationFn: (matches: { invoiceId: string; amount: number; reference?: string }[]) =>
            api.post("/finance/payments/bulk-record", { matches }).then((r) => r.data.data),
        onSuccess: (data: { recorded: number; failed: number }) => {
            setDone(data);
            qc.invalidateQueries({ queryKey: ["invoices"] });
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not record payments"),
    });

    const runMatch = () => {
        const { lines, skipped: n } = parseStatementText(text);
        setSkipped(n);
        if (lines.length === 0) {
            setError("No usable lines found — each line needs at least an amount.");
            return;
        }
        match.mutate(lines);
    };

    const onFile = async (file: File) => {
        const content = await file.text();
        setText(content);
    };

    const confirmMatches = () => {
        if (!result) return;
        const matches: { invoiceId: string; amount: number; reference?: string }[] = [];
        for (const m of result.matched) {
            if (accepted[m.index]) {
                matches.push({ invoiceId: m.invoice.id, amount: m.line.amount, reference: m.line.reference });
            }
        }
        for (const a of result.ambiguous) {
            const invoiceId = resolved[a.index];
            if (invoiceId) matches.push({ invoiceId, amount: a.line.amount, reference: a.line.reference });
        }
        if (matches.length === 0) {
            setError("Nothing selected to record.");
            return;
        }
        record.mutate(matches);
    };

    const confirmedCount = result
        ? result.matched.filter((m) => accepted[m.index]).length +
          result.ambiguous.filter((a) => resolved[a.index]).length
        : 0;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Banknote className="h-5 w-5" />
                        Record EFT batch
                    </DialogTitle>
                    <DialogDescription>
                        Paste cleared bank-statement lines (or upload a CSV with date, amount, reference).
                        We match them to open invoices for review before anything is recorded.
                    </DialogDescription>
                </DialogHeader>

                {done ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-emerald-800">
                                    {done.recorded} payment{done.recorded !== 1 ? "s" : ""} recorded
                                </p>
                                {done.failed > 0 && (
                                    <p className="text-rose-600 mt-1">{done.failed} failed — check the invoices and retry.</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={() => close(false)}>Done</Button>
                        </div>
                    </div>
                ) : !result ? (
                    <div className="space-y-3">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={8}
                            placeholder={"2026-07-14, 1150.00, FNB EFT INV-00001 ACME\n2026-07-14, 500.00, EFT MTHEMBU PLUMBING"}
                            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                        />
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onFile(f);
                                e.target.value = "";
                            }}
                        />
                        <div className="flex items-center justify-between gap-2">
                            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
                                <Upload className="h-3.5 w-3.5" />
                                Upload CSV
                            </Button>
                            <Button size="sm" onClick={runMatch} disabled={!text.trim() || match.isPending} className="gap-1.5">
                                {match.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Match to invoices
                            </Button>
                        </div>
                        {error && <p className="text-sm text-rose-600">{error}</p>}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                {result.matched.length} matched
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                                {result.ambiguous.length} ambiguous
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                {result.unmatched.length} unmatched
                            </span>
                            {skipped > 0 && <span>{skipped} line{skipped !== 1 ? "s" : ""} skipped (no amount)</span>}
                        </div>

                        {result.matched.length > 0 && (
                            <div className="rounded-lg border border-border overflow-hidden">
                                <div className="px-3 py-2 bg-slate-50/70 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Matched
                                </div>
                                <div className="divide-y divide-border/60">
                                    {result.matched.map((m) => (
                                        <label key={m.index} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50/70">
                                            <input
                                                type="checkbox"
                                                checked={!!accepted[m.index]}
                                                onChange={(e) => setAccepted((s) => ({ ...s, [m.index]: e.target.checked }))}
                                                className="h-4 w-4 rounded border-border"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <span className="font-medium">{fmt(m.line.amount)}</span>
                                                <span className="text-muted-foreground"> · {m.line.reference || "no reference"}</span>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    → {m.invoice.invoiceNumber ?? m.invoice.id.slice(0, 8)} · {m.invoice.customerName ?? "Unknown"} ·{" "}
                                                    {fmt(m.invoice.balance)} due · matched by {m.confidence}
                                                </div>
                                            </div>
                                            {m.amountMismatch && (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 shrink-0">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    amount ≠ balance
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.ambiguous.length > 0 && (
                            <div className="rounded-lg border border-amber-200 overflow-hidden">
                                <div className="px-3 py-2 bg-amber-50/70 border-b border-amber-200 text-xs font-semibold uppercase tracking-wide text-amber-700">
                                    Ambiguous — pick the right invoice
                                </div>
                                <div className="divide-y divide-border/60">
                                    {result.ambiguous.map((a) => (
                                        <div key={a.index} className="px-3 py-2.5 text-sm space-y-1.5">
                                            <div>
                                                <span className="font-medium">{fmt(a.line.amount)}</span>
                                                <span className="text-muted-foreground"> · {a.line.reference || "no reference"}</span>
                                            </div>
                                            <select
                                                value={resolved[a.index] ?? ""}
                                                onChange={(e) =>
                                                    setResolved((s) => ({ ...s, [a.index]: e.target.value }))
                                                }
                                                className="w-full rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                                            >
                                                <option value="">Skip this line</option>
                                                {a.candidates.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.invoiceNumber ?? c.id.slice(0, 8)} · {c.customerName ?? "Unknown"} · {fmt(c.balance)} due
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.unmatched.length > 0 && (
                            <div className="rounded-lg border border-border overflow-hidden">
                                <div className="px-3 py-2 bg-slate-50/70 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Unmatched — record these individually
                                </div>
                                <div className="divide-y divide-border/60">
                                    {result.unmatched.map((u) => (
                                        <div key={u.index} className="px-3 py-2 text-sm text-muted-foreground">
                                            {fmt(u.line.amount)} · {u.line.reference || "no reference"}
                                            {u.line.date ? ` · ${u.line.date}` : ""}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && <p className="text-sm text-rose-600">{error}</p>}

                        <div className="flex items-center justify-between gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                                Back
                            </Button>
                            <Button size="sm" onClick={confirmMatches} disabled={confirmedCount === 0 || record.isPending} className="gap-1.5">
                                {record.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Record {confirmedCount} payment{confirmedCount !== 1 ? "s" : ""}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
