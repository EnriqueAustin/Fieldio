"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { downloadFile } from "../../lib/download";
import { toast } from "../ui/use-toast";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { CheckCircle2, Download, FileWarning, Loader2, RefreshCw } from "lucide-react";

interface ReconInvoice {
    id: string;
    invoiceNumber: string | null;
    customerName: string | null;
    jobTitle: string | null;
    total: number;
    balance: number;
    status: string;
    exportedAt: string | null;
    exportBatchId: string | null;
    paidAt: string | null;
    reconciledAt: string | null;
}

interface ReconData {
    summary: {
        total: number;
        notExported: number;
        clean: number;
        modifiedSinceExport: number;
        paidAfterExport: number;
    };
    notExported: ReconInvoice[];
    clean: ReconInvoice[];
    modifiedSinceExport: ReconInvoice[];
    paidAfterExport: ReconInvoice[];
}

type Bucket = "notExported" | "modifiedSinceExport" | "paidAfterExport" | "clean";

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
    { key: "notExported", label: "Not exported", hint: "Never included in a Sage export" },
    { key: "modifiedSinceExport", label: "Changed since export", hint: "Edited after export — re-export needed" },
    { key: "paidAfterExport", label: "Paid after export", hint: "Payment landed after export — Sage AR is stale" },
    { key: "clean", label: "Exported & clean", hint: "Exported and unchanged since" },
];

function fmt(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Sage reconciliation view (G-5): buckets invoices by export state for a date
 * range, with re-export and mark-as-reconciled actions on a selection.
 */
export function SageReconciliation({ from, to }: { from: string; to: string }) {
    const qc = useQueryClient();
    const [bucket, setBucket] = useState<Bucket>("notExported");
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [exporting, setExporting] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ["sage-reconciliation", from, to],
        queryFn: () =>
            api
                .get("/finance/export/sage/reconciliation", {
                    params: { from: from || undefined, to: to || undefined },
                })
                .then((r) => r.data.data as ReconData),
    });

    const rows: ReconInvoice[] = useMemo(() => (data ? data[bucket] : []), [data, bucket]);
    const selectedIds = rows.filter((r) => selected[r.id]).map((r) => r.id);
    const allSelected = rows.length > 0 && selectedIds.length === rows.length;

    const switchBucket = (b: Bucket) => {
        setBucket(b);
        setSelected({});
    };

    const reExport = async () => {
        setExporting(true);
        try {
            await downloadFile("/finance/export/sage/invoices", "sage-invoices-reexport.csv", {
                ids: selectedIds.join(","),
            });
            qc.invalidateQueries({ queryKey: ["sage-reconciliation"] });
            setSelected({});
        } catch {
            toast({ title: "Failed to re-export selection", variant: "destructive" });
        } finally {
            setExporting(false);
        }
    };

    const reconcile = useMutation({
        mutationFn: (ids: string[]) =>
            api.post("/finance/export/sage/reconcile", { ids }).then((r) => r.data.data),
        onSuccess: (d: { reconciled: number }) => {
            toast({ title: `${d.reconciled} invoice${d.reconciled !== 1 ? "s" : ""} marked reconciled` });
            qc.invalidateQueries({ queryKey: ["sage-reconciliation"] });
            setSelected({});
        },
        onError: () => toast({ title: "Failed to mark as reconciled", variant: "destructive" }),
    });

    if (isLoading || !data) {
        return <div className="surface-card h-64 animate-pulse" />;
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
                {BUCKETS.map((b) => (
                    <button
                        key={b.key}
                        onClick={() => switchBucket(b.key)}
                        className={`surface-card p-5 text-left transition ${
                            bucket === b.key ? "ring-2 ring-slate-900" : "hover:bg-slate-50/70"
                        }`}
                    >
                        <p className="text-2xl font-semibold">{data.summary[b.key]}</p>
                        <p className="text-xs font-medium">{b.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{b.hint}</p>
                    </button>
                ))}
            </div>

            <div className="surface-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                        {rows.length} invoice{rows.length !== 1 ? "s" : ""}
                        {selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={selectedIds.length === 0 || exporting}
                            onClick={reExport}
                            className="gap-1.5"
                        >
                            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {bucket === "notExported" ? "Export selected" : "Re-export selected"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={selectedIds.length === 0 || reconcile.isPending}
                            onClick={() => reconcile.mutate(selectedIds)}
                            className="gap-1.5"
                        >
                            {reconcile.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Mark reconciled
                        </Button>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center py-14 text-center">
                        <FileWarning className="h-6 w-6 text-slate-300" />
                        <p className="mt-2 text-sm text-muted-foreground">Nothing in this bucket for the selected period.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-4 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={(e) =>
                                            setSelected(
                                                e.target.checked ? Object.fromEntries(rows.map((r) => [r.id, true])) : {}
                                            )
                                        }
                                        className="h-4 w-4 rounded border-border"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exported</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reconciled</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {rows.map((inv) => (
                                <tr key={inv.id} className="hover:bg-slate-50/70">
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={!!selected[inv.id]}
                                            onChange={(e) => setSelected((s) => ({ ...s, [inv.id]: e.target.checked }))}
                                            className="h-4 w-4 rounded border-border"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium">
                                        {inv.invoiceNumber ?? inv.id.slice(0, 8)}
                                        {inv.jobTitle && (
                                            <span className="block text-xs font-normal text-muted-foreground truncate">{inv.jobTitle}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{inv.customerName ?? "—"}</td>
                                    <td className="px-4 py-3"><StatusPill status={inv.status} /></td>
                                    <td className="px-4 py-3 text-sm text-right tabular-nums">{fmt(inv.total)}</td>
                                    <td className="px-4 py-3 text-sm text-right tabular-nums text-muted-foreground">{fmtDate(inv.exportedAt)}</td>
                                    <td className="px-4 py-3 text-sm text-right tabular-nums text-muted-foreground">
                                        {inv.reconciledAt ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-600">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                {fmtDate(inv.reconciledAt)}
                                            </span>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" />
                Exporting a Sage invoices CSV stamps each included invoice, so this view always reflects the latest export.
            </p>
        </div>
    );
}
