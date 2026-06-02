"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

interface OverdueInvoice {
    id: string;
    invoiceNumber: string | null;
    total: string;
    balance: string;
    dueDate: string;
    status: string;
    job: {
        id: string;
        title: string;
        customer: { id: string; name: string; email: string | null; phone: string | null };
    };
}

export default function OverdueInvoicesPage() {
    const [invoices, setInvoices] = useState<OverdueInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sending, setSending] = useState<Set<string>>(new Set());
    const [sent, setSent] = useState<Set<string>>(new Set());
    const [bulkSending, setBulkSending] = useState(false);

    const fetchOverdue = async () => {
        try {
            const res = await api.get("/finance/invoices/overdue");
            setInvoices(res.data.data.invoices ?? []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOverdue(); }, []);

    const toggleSelect = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const toggleAll = () => {
        if (selected.size === invoices.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(invoices.map((i) => i.id)));
        }
    };

    const sendReminder = async (id: string) => {
        setSending((prev) => new Set(prev).add(id));
        try {
            await api.post(`/finance/invoices/${id}/reminder`);
            setSent((prev) => new Set(prev).add(id));
        } catch (e) {
            console.error(e);
        } finally {
            setSending((prev) => { const next = new Set(prev); next.delete(id); return next; });
        }
    };

    const sendBulkReminders = async () => {
        setBulkSending(true);
        try {
            await api.post("/finance/invoices/bulk-reminder", { ids: Array.from(selected) });
            setSent((prev) => new Set([...prev, ...selected]));
            setSelected(new Set());
        } catch (e) {
            console.error(e);
        } finally {
            setBulkSending(false);
        }
    };

    const totalOverdue = invoices.reduce((sum, i) => sum + Number(i.balance), 0);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="surface-card h-96 animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to reports
            </Link>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Overdue Invoices</h1>
                    <p className="page-subtitle">
                        {invoices.length} overdue invoice{invoices.length !== 1 ? "s" : ""} totalling{" "}
                        <span className="font-semibold text-rose-600">R{totalOverdue.toFixed(2)}</span>
                    </p>
                </div>
                {selected.size > 0 && (
                    <Button
                        onClick={sendBulkReminders}
                        disabled={bulkSending}
                        className="gap-2 bg-amber-600 hover:bg-amber-700"
                    >
                        <Mail className="h-4 w-4" />
                        {bulkSending ? "Sending…" : `Send ${selected.size} reminder${selected.size > 1 ? "s" : ""}`}
                    </Button>
                )}
            </div>

            {invoices.length === 0 ? (
                <div className="surface-card p-12 text-center">
                    <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <h3 className="mt-3 font-semibold">All clear</h3>
                    <p className="text-sm text-muted-foreground mt-1">No overdue invoices right now.</p>
                </div>
            ) : (
                <div className="surface-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selected.size === invoices.length}
                                onChange={toggleAll}
                                className="rounded border-slate-300"
                            />
                            Select all
                        </label>
                    </div>
                    <div className="divide-y divide-border/60">
                        {invoices.map((inv) => {
                            const overdueDays = formatDistanceToNowStrict(new Date(inv.dueDate), { addSuffix: true });
                            const isSent = sent.has(inv.id);
                            const isSending = sending.has(inv.id);

                            return (
                                <div key={inv.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(inv.id)}
                                        onChange={() => toggleSelect(inv.id)}
                                        className="rounded border-slate-300"
                                    />
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                                            <AlertCircle className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/jobs/${inv.job.id}`}
                                                    className="text-sm font-medium truncate hover:text-blue-600"
                                                >
                                                    {inv.invoiceNumber || inv.id.slice(0, 8)}
                                                </Link>
                                                <span className="text-[10px] rounded-full px-2 py-0.5 bg-rose-100 text-rose-700 font-medium shrink-0">
                                                    {overdueDays}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {inv.job.customer.name} · {inv.job.title}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-sm text-rose-600">
                                            R{Number(inv.balance).toFixed(2)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            of R{Number(inv.total).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {isSent ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                                            </span>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => sendReminder(inv.id)}
                                                disabled={isSending}
                                                className="gap-1.5 text-xs"
                                            >
                                                <Mail className="h-3.5 w-3.5" />
                                                {isSending ? "Sending…" : "Remind"}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
