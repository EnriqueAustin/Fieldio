"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { CheckCircle2, FilePlus2, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";

interface UninvoicedJob {
    id: string;
    title: string;
    customer: { id: string; name: string } | null;
    lineItems: { total: string }[];
}

interface BulkResult {
    results: { jobId: string; ok: boolean; invoiceNumber?: string | null; error?: string }[];
    created: number;
    failed: number;
}

function fmt(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

/**
 * "Generate invoices" bulk action (G-3): multi-select completed-uninvoiced
 * jobs and invoice them all in one call, with per-job success/failure.
 */
export function BulkGenerateInvoicesDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const qc = useQueryClient();
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [result, setResult] = useState<BulkResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["uninvoiced-jobs"],
        queryFn: () => api.get("/finance/invoices/uninvoiced-jobs").then((r) => r.data.data.jobs ?? []),
        enabled: open,
    });

    const jobs: UninvoicedJob[] = data ?? [];
    const selectedIds = jobs.filter((j) => selected[j.id]).map((j) => j.id);
    const allSelected = jobs.length > 0 && selectedIds.length === jobs.length;

    const close = (v: boolean) => {
        if (!v) {
            setSelected({});
            setResult(null);
            setError(null);
        }
        onOpenChange(v);
    };

    const generate = useMutation({
        mutationFn: (jobIds: string[]) =>
            api.post("/finance/invoices/bulk-generate", { jobIds }).then((r) => r.data.data as BulkResult),
        onSuccess: (data) => {
            setResult(data);
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["uninvoiced-jobs"] });
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not generate invoices"),
    });

    const jobTitle = (jobId: string) => jobs.find((j) => j.id === jobId)?.title ?? jobId;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FilePlus2 className="h-5 w-5" />
                        Generate invoices
                    </DialogTitle>
                    <DialogDescription>
                        Select completed jobs to invoice in one go. Totals and VAT are calculated automatically.
                    </DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-emerald-800">
                                    {result.created} invoice{result.created !== 1 ? "s" : ""} created
                                </p>
                                {result.failed > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-rose-600">
                                        {result.results
                                            .filter((r) => !r.ok)
                                            .map((r) => (
                                                <li key={r.jobId}>
                                                    {jobTitle(r.jobId)}: {r.error}
                                                </li>
                                            ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={() => close(false)}>Done</Button>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="py-8 flex justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No completed, uninvoiced jobs right now.
                    </div>
                ) : (
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={(e) =>
                                    setSelected(e.target.checked ? Object.fromEntries(jobs.map((j) => [j.id, true])) : {})
                                }
                                className="h-4 w-4 rounded border-border"
                            />
                            Select all ({jobs.length})
                        </label>
                        <div className="divide-y divide-border/60 rounded-lg border border-border">
                            {jobs.map((job) => {
                                const subtotal = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
                                return (
                                    <label
                                        key={job.id}
                                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50/70"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!!selected[job.id]}
                                            onChange={(e) => setSelected((s) => ({ ...s, [job.id]: e.target.checked }))}
                                            className="h-4 w-4 rounded border-border"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium truncate">{job.title}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {job.customer?.name ?? "Unknown"} · {fmt(subtotal)} (excl. VAT)
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        {error && <p className="text-sm text-rose-600">{error}</p>}
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                disabled={selectedIds.length === 0 || generate.isPending}
                                onClick={() => generate.mutate(selectedIds)}
                                className="gap-1.5"
                            >
                                {generate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Invoice {selectedIds.length} job{selectedIds.length !== 1 ? "s" : ""}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
