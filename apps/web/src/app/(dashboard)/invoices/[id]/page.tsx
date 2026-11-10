"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
    ArrowLeft,
    Download,
    Send,
    Link2,
    Banknote,
    Ban,
    Briefcase,
    Loader2,
    AlertCircle,
    Receipt,
} from "lucide-react";
import api from "../../../../lib/api";
import { downloadFile } from "../../../../lib/download";
import { Button } from "../../../../components/ui/button";
import { StatusPill } from "../../../../components/ui/status-pill";
import { useToast } from "../../../../hooks/use-toast";
import { RecordPaymentDialog } from "../../../../components/invoices/record-payment-dialog";
import { VoidInvoiceDialog } from "../../../../components/invoices/void-invoice-dialog";

interface InvoiceItem {
    name: string;
    description?: string | null;
    quantity: number | string;
    unitPrice: number | string;
    total: number | string;
}

interface InvoicePayment {
    id: string;
    amount: number | string;
    method: string;
    status: string;
    createdAt: string;
    reference?: string | null;
    note?: string | null;
    overpayment?: number | null;
    metadata?: { reference?: string; note?: string; overpayment?: number } | null;
}

interface Invoice {
    id: string;
    invoiceNumber: string | null;
    status: string;
    heading?: string | null;
    createdAt: string;
    dueDate: string | null;
    paidAt: string | null;
    voidedAt?: string | null;
    voidReason?: string | null;
    items: InvoiceItem[] | null;
    subtotal: number | string;
    tax: number | string;
    total: number | string;
    balance: number | string;
    taxLabel?: string | null;
    taxRate?: number | string | null;
    taxNumber?: string | null;
    supplierName?: string | null;
    customerName?: string | null;
    customerVatNumber?: string | null;
    customerAddress?: string | null;
    publicToken?: string | null;
    payments?: InvoicePayment[] | null;
    job?: { id: string; title: string } | null;
    customer?: { id: string; name: string } | null;
}

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

function formatDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Intl.DateTimeFormat("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
    }).format(new Date(d));
}

function formatDateTime(d: string | null | undefined) {
    if (!d) return "—";
    return new Intl.DateTimeFormat("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Johannesburg",
    }).format(new Date(d));
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: "Cash",
    CHECK: "Cheque",
    EFT: "EFT",
    CARD: "Card",
    PAYFAST: "PayFast",
    ACH: "ACH",
    OTHER: "Other",
};

export default function InvoiceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const qc = useQueryClient();
    const { toast } = useToast();
    const [recording, setRecording] = useState(false);
    const [voiding, setVoiding] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["invoice", id],
        queryFn: () => api.get(`/finance/invoices/${id}`).then((r) => r.data.data.invoice as Invoice),
        enabled: !!id,
        retry: false,
    });

    const send = useMutation({
        mutationFn: () => api.post(`/finance/invoices/${id}/send`).then((r) => r.data.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["invoice", id] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            toast({ title: "Invoice sent", description: "The customer has been notified." });
        },
        onError: (e: any) =>
            toast({ title: "Could not send", description: e?.response?.data?.message ?? "", variant: "destructive" }),
    });

    const copyPayLink = useMutation({
        mutationFn: () =>
            api.get(`/payments/invoices/${id}/pay-link`).then((r) => r.data.data.url as string),
        onSuccess: async (url: string) => {
            try {
                await navigator.clipboard.writeText(url);
                toast({ title: "Pay link copied", description: url });
            } catch {
                toast({ title: "Pay link", description: url });
            }
        },
        onError: (e: any) =>
            toast({
                title: "Could not get pay link",
                description: e?.response?.data?.message ?? "",
                variant: "destructive",
            }),
    });

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const num = data?.invoiceNumber || data?.id.slice(0, 8) || "invoice";
            await downloadFile(`/finance/invoices/${id}/pdf`, `${num}.pdf`);
        } catch (e: any) {
            toast({
                title: "Could not download PDF",
                description: e?.response?.data?.message ?? "",
                variant: "destructive",
            });
        } finally {
            setDownloading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="surface-card h-96 animate-pulse" />
            </div>
        );
    }

    if (isError || !data) {
        const status = (error as any)?.response?.status;
        return (
            <div className="space-y-6">
                <Link
                    href="/invoices"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to invoices
                </Link>
                <div className="surface-card flex flex-col items-center text-center py-16 px-6">
                    <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium">
                        {status === 404 ? "Invoice not found" : "Could not load this invoice"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {status === 404
                            ? "It may have been removed, or the link is wrong."
                            : "Please try again in a moment."}
                    </p>
                </div>
            </div>
        );
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const payments = (Array.isArray(data.payments) ? data.payments : []).filter(
        (p) => p.status === "SUCCEEDED" || p.status === "REFUNDED"
    );
    const total = Number(data.total);
    const balance = Number(data.balance);
    const paid = Math.max(0, total - balance);
    const taxLabel = data.taxLabel || "VAT";
    const taxRate = data.taxRate != null ? Number(data.taxRate) : null;
    const heading = data.heading || "Invoice";
    const customerName = data.customerName ?? data.customer?.name ?? data.job?.title ?? "Customer";
    const isVoid = data.status === "VOID";
    const hasPayments = payments.length > 0;
    const canVoid = !isVoid && !hasPayments;
    const sendLabel = data.status === "DRAFT" ? "Send" : "Resend";

    const voidDisabledReason = isVoid
        ? "This invoice is already void."
        : hasPayments
          ? "Invoices with recorded payments can't be voided."
          : "";

    return (
        <div className="space-y-6">
            <Link
                href="/invoices"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to invoices
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="page-title">{data.invoiceNumber || `Invoice ${data.id.slice(0, 8)}`}</h1>
                        <StatusPill status={data.status} />
                    </div>
                    <p className="page-subtitle">
                        {heading} · {customerName}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={handleDownload} disabled={downloading} className="gap-1.5">
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download PDF
                    </Button>
                    {!isVoid && (
                        <Button
                            variant="outline"
                            onClick={() => send.mutate()}
                            disabled={send.isPending}
                            className="gap-1.5"
                        >
                            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {sendLabel}
                        </Button>
                    )}
                    {!isVoid && (
                        <Button
                            variant="outline"
                            onClick={() => copyPayLink.mutate()}
                            disabled={copyPayLink.isPending}
                            className="gap-1.5"
                        >
                            {copyPayLink.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Link2 className="h-4 w-4" />
                            )}
                            Copy pay link
                        </Button>
                    )}
                    {!isVoid && balance > 0 && (
                        <Button onClick={() => setRecording(true)} className="gap-1.5">
                            <Banknote className="h-4 w-4" />
                            Record payment
                        </Button>
                    )}
                    <span title={voidDisabledReason || undefined} className="inline-flex">
                        <Button
                            variant="ghost"
                            onClick={() => setVoiding(true)}
                            disabled={!canVoid}
                            className="gap-1.5 text-rose-600 hover:text-rose-700"
                        >
                            <Ban className="h-4 w-4" />
                            Void
                        </Button>
                    </span>
                </div>
            </div>

            {isVoid && (
                <div className="surface-card border-rose-200 bg-rose-50/60 p-4 flex items-start gap-3">
                    <Ban className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
                    <div>
                        <div className="text-sm font-medium text-rose-800">
                            This invoice was voided{data.voidedAt ? ` on ${formatDate(data.voidedAt)}` : ""}.
                        </div>
                        {data.voidReason && (
                            <div className="text-xs text-rose-700 mt-0.5">Reason: {data.voidReason}</div>
                        )}
                    </div>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-2xl font-bold mt-0.5">{formatCurrency(total)}</div>
                </div>
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Paid</div>
                    <div className="text-xl font-semibold mt-0.5 text-emerald-600">{formatCurrency(paid)}</div>
                </div>
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div
                        className={`text-xl font-semibold mt-0.5 ${balance > 0 ? "text-rose-600" : "text-foreground"}`}
                    >
                        {formatCurrency(balance)}
                    </div>
                </div>
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Dates</div>
                    <div className="text-sm font-medium mt-1">Issued {formatDate(data.createdAt)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                        {data.paidAt ? `Paid ${formatDate(data.paidAt)}` : `Due ${formatDate(data.dueDate)}`}
                    </div>
                </div>
            </div>

            {/* Parties */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="surface-card p-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Billed to</div>
                    <div className="mt-2 text-sm font-medium">{customerName}</div>
                    {data.customerAddress && (
                        <div className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                            {data.customerAddress}
                        </div>
                    )}
                    {data.customerVatNumber && (
                        <div className="text-xs text-muted-foreground mt-2">
                            {taxLabel} No. {data.customerVatNumber}
                        </div>
                    )}
                </div>
                <div className="surface-card p-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">From</div>
                    <div className="mt-2 text-sm font-medium">{data.supplierName || "—"}</div>
                    {data.taxNumber && (
                        <div className="text-xs text-muted-foreground mt-2">
                            {taxLabel} No. {data.taxNumber}
                        </div>
                    )}
                    {data.job && (
                        <Link
                            href={`/jobs/${data.job.id}`}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-3"
                        >
                            <Briefcase className="h-4 w-4" />
                            {data.job.title || "View job"}
                        </Link>
                    )}
                </div>
            </div>

            {/* Line items + totals */}
            <div className="surface-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70 text-sm font-medium">Line items</div>
                {items.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground">No line items.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-muted-foreground border-b border-border/60">
                                <th className="text-left font-medium px-5 py-2.5">Item</th>
                                <th className="text-right font-medium px-3 py-2.5">Qty</th>
                                <th className="text-right font-medium px-3 py-2.5">Unit price</th>
                                <th className="text-right font-medium px-5 py-2.5">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {items.map((item, i) => (
                                <tr key={i}>
                                    <td className="px-5 py-3">
                                        <div className="font-medium">{item.name}</div>
                                        {item.description && (
                                            <div className="text-xs text-muted-foreground">{item.description}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-right text-muted-foreground">
                                        {Number(item.quantity)}
                                    </td>
                                    <td className="px-3 py-3 text-right text-muted-foreground">
                                        {formatCurrency(Number(item.unitPrice))}
                                    </td>
                                    <td className="px-5 py-3 text-right font-medium">
                                        {formatCurrency(Number(item.total))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="border-t border-border/60 px-5 py-4 bg-slate-50/40">
                    <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal (excl. {taxLabel})</span>
                            <span>{formatCurrency(Number(data.subtotal))}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">
                                {taxLabel}
                                {taxRate != null ? ` (${taxRate}%)` : ""}
                            </span>
                            <span>{formatCurrency(Number(data.tax))}</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-border/60 font-semibold">
                            <span>Total (incl. {taxLabel})</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                        {paid > 0 && (
                            <div className="flex justify-between text-emerald-600">
                                <span>Paid</span>
                                <span>−{formatCurrency(paid)}</span>
                            </div>
                        )}
                        <div className="flex justify-between pt-1.5 border-t border-border/60 font-semibold">
                            <span>Balance due</span>
                            <span className={balance > 0 ? "text-rose-600" : ""}>{formatCurrency(balance)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payments */}
            <div className="surface-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70 text-sm font-medium">Payments</div>
                {payments.length === 0 ? (
                    <div className="px-5 py-8 flex flex-col items-center text-center text-sm text-muted-foreground">
                        <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                            <Receipt className="h-4 w-4" />
                        </div>
                        No payments recorded yet.
                    </div>
                ) : (
                    <div className="divide-y divide-border/60">
                        {payments.map((p) => {
                            const overpayment = Number(p.overpayment ?? p.metadata?.overpayment ?? 0);
                            const refOrNote = [p.reference ?? p.metadata?.reference, p.note ?? p.metadata?.note].filter(Boolean).join(" · ");
                            return (
                                <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium">
                                            {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                                            {p.status === "REFUNDED" && (
                                                <span className="ml-2 text-xs text-rose-600">(refunded)</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {formatDateTime(p.createdAt)}
                                            {refOrNote ? ` · ${refOrNote}` : ""}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-semibold text-sm">{formatCurrency(Number(p.amount))}</div>
                                        {overpayment > 0 && (
                                            <div className="text-[10px] text-amber-600">
                                                {formatCurrency(overpayment)} overpayment
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <RecordPaymentDialog
                invoiceId={data.id}
                balance={balance}
                open={recording}
                onOpenChange={setRecording}
            />
            <VoidInvoiceDialog invoiceId={data.id} open={voiding} onOpenChange={setVoiding} />
        </div>
    );
}
