"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "../../../lib/api";
import { Receipt, Search, AlertCircle, Plus, Loader2, Check, Banknote, FilePlus2 } from "lucide-react";
import { StatusPill } from "../../../components/ui/status-pill";
import { Button } from "../../../components/ui/button";
import { EftBatchDialog } from "../../../components/finance/eft-batch-dialog";
import { BulkGenerateInvoicesDialog } from "../../../components/finance/bulk-generate-invoices-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../../components/ui/dialog";

interface Invoice {
    id: string;
    invoiceNumber: string | null;
    status: string;
    total: string;
    balance: string;
    dueDate: string | null;
    createdAt: string;
    job: { id: string; title: string; customer: { name: string } | null } | null;
}

interface UninvoicedJob {
    id: string;
    title: string;
    customer: { id: string; name: string } | null;
    lineItems: { total: string }[];
}

const STATUS_TABS = ["ALL", "DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "VOID"] as const;

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function InvoicesPage() {
    const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("ALL");
    const [search, setSearch] = useState("");
    const [creating, setCreating] = useState(false);
    const [recordingBatch, setRecordingBatch] = useState(false);
    const [bulkGenerating, setBulkGenerating] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ["invoices", tab],
        queryFn: () =>
            api
                .get(`/finance/invoices?limit=100${tab !== "ALL" ? `&status=${tab}` : ""}`)
                .then((r) => r.data.data),
    });

    const invoices: Invoice[] = data?.items ?? [];

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return invoices;
        return invoices.filter(
            (i) =>
                (i.job?.customer?.name ?? "").toLowerCase().includes(q) ||
                (i.invoiceNumber ?? "").toLowerCase().includes(q) ||
                (i.job?.title ?? "").toLowerCase().includes(q)
        );
    }, [invoices, search]);

    const totalBilled = filtered.reduce((sum, i) => sum + Number(i.total), 0);
    const outstanding = filtered.reduce((sum, i) => sum + Number(i.balance), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Invoices</h1>
                    <p className="page-subtitle">All customer invoices across your business.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/invoices/overdue"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
                    >
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                        Overdue
                    </Link>
                    <button
                        onClick={() => setRecordingBatch(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
                    >
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        Record EFT batch
                    </button>
                    <button
                        onClick={() => setBulkGenerating(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
                    >
                        <FilePlus2 className="h-4 w-4 text-blue-600" />
                        Generate invoices
                    </button>
                    <button
                        onClick={() => setCreating(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
                    >
                        <Plus className="h-4 w-4" />
                        New invoice
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {STATUS_TABS.map((s) => (
                    <button
                        key={s}
                        onClick={() => setTab(s)}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                            tab === s
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-border text-muted-foreground hover:bg-slate-50"
                        }`}
                    >
                        {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            <div className="surface-card p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by customer, invoice number or job…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="surface-card h-96 animate-pulse" />
            ) : filtered.length === 0 ? (
                <div className="surface-card flex flex-col items-center text-center py-16 px-6">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Receipt className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium">No invoices here</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Invoices are created from completed jobs.
                    </p>
                </div>
            ) : (
                <div className="surface-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                            {filtered.length} invoice{filtered.length !== 1 ? "s" : ""} · billed{" "}
                            <span className="font-semibold text-foreground">{formatCurrency(totalBilled)}</span>
                        </span>
                        <span>
                            Outstanding:{" "}
                            <span className="font-semibold text-rose-600">{formatCurrency(outstanding)}</span>
                        </span>
                    </div>
                    <div className="divide-y divide-border/60">
                        {filtered.map((inv) => (
                            <Link
                                key={inv.id}
                                href={inv.job ? `/jobs/${inv.job.id}` : "#"}
                                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition"
                            >
                                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                    <Receipt className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">
                                            {inv.invoiceNumber || inv.id.slice(0, 8)}
                                        </span>
                                        <StatusPill status={inv.status} />
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {inv.job?.customer?.name ?? "Unknown"}
                                        {inv.job?.title ? ` · ${inv.job.title}` : ""} · due {formatDate(inv.dueDate)}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm">{formatCurrency(Number(inv.total))}</div>
                                    {Number(inv.balance) > 0 && (
                                        <div className="text-[10px] text-rose-600">
                                            {formatCurrency(Number(inv.balance))} due
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <CreateInvoiceDialog open={creating} onOpenChange={setCreating} />
            <EftBatchDialog open={recordingBatch} onOpenChange={setRecordingBatch} />
            <BulkGenerateInvoicesDialog open={bulkGenerating} onOpenChange={setBulkGenerating} />
        </div>
    );
}

function CreateInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const router = useRouter();
    const qc = useQueryClient();
    const [error, setError] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["uninvoiced-jobs"],
        queryFn: () => api.get("/finance/invoices/uninvoiced-jobs").then((r) => r.data.data.jobs ?? []),
        enabled: open,
    });

    const jobs: UninvoicedJob[] = data ?? [];

    const create = useMutation({
        mutationFn: (jobId: string) =>
            api.post(`/finance/jobs/${jobId}/invoice`).then((r) => r.data.data.invoice),
        onSuccess: (invoice: { job?: { id: string }; jobId?: string }) => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["uninvoiced-jobs"] });
            onOpenChange(false);
            const jobId = invoice.jobId ?? invoice.job?.id;
            if (jobId) router.push(`/jobs/${jobId}`);
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not create invoice"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New invoice</DialogTitle>
                    <DialogDescription>
                        Pick a completed job to invoice. Totals and VAT are calculated automatically.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 flex justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No completed, uninvoiced jobs right now.
                    </div>
                ) : (
                    <div className="divide-y divide-border/60 rounded-lg border border-border">
                        {jobs.map((job) => {
                            const subtotal = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
                            return (
                                <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">{job.title}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {job.customer?.name ?? "Unknown"} · {formatCurrency(subtotal)} (excl. VAT)
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={create.isPending}
                                        onClick={() => create.mutate(job.id)}
                                        className="gap-1.5 shrink-0"
                                    >
                                        {create.isPending && create.variables === job.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5" />
                                        )}
                                        Invoice
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && <p className="text-sm text-rose-600">{error}</p>}
            </DialogContent>
        </Dialog>
    );
}
