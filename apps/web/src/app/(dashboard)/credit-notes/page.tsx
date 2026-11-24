"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { FileText, Plus, Trash2, X } from "lucide-react";

type LineItem = { name: string; description?: string; quantity: number; unitPrice: number };

const money = (n: number) => `R ${Number(n || 0).toFixed(2)}`;
const blankLine = (): LineItem => ({ name: "", description: "", quantity: 1, unitPrice: 0 });

function NewCreditNoteDialog({
    onClose,
    prefillInvoiceId,
}: {
    onClose: () => void;
    prefillInvoiceId?: string | null;
}) {
    const qc = useQueryClient();
    const [customerId, setCustomerId] = useState("");
    const [invoiceId, setInvoiceId] = useState("");
    const [reason, setReason] = useState("");
    const [taxRate, setTaxRate] = useState(15);
    const [taxLabel, setTaxLabel] = useState("VAT");
    const [items, setItems] = useState<LineItem[]>([blankLine()]);
    const [error, setError] = useState<string | null>(null);

    const { data: customers = [] } = useQuery({
        queryKey: ["customers-light"],
        queryFn: () => api.get("/customers?limit=100").then((r) => r.data.data.items ?? []),
    });
    // All invoices (office list) — filtered to the chosen customer below so the
    // office can optionally pin the note to a specific invoice.
    const { data: invoices = [] } = useQuery({
        queryKey: ["invoices-for-credit"],
        queryFn: () => api.get("/finance/invoices?limit=200").then((r) => r.data.data.items ?? []),
    });

    const selectedCustomer = customers.find((c: any) => c.id === customerId);
    const customerInvoices = useMemo(
        () =>
            invoices.filter(
                (inv: any) =>
                    selectedCustomer &&
                    (inv.customerName === selectedCustomer.name ||
                        inv.job?.customer?.name === selectedCustomer.name)
            ),
        [invoices, selectedCustomer]
    );

    // Pre-fill from an invoice: customer, invoice link, its line items + VAT, so
    // crediting back a specific invoice is one click from the invoice page.
    useEffect(() => {
        if (!prefillInvoiceId) return;
        let cancelled = false;
        api
            .get(`/finance/invoices/${prefillInvoiceId}`)
            .then((r) => {
                if (cancelled) return;
                const inv = r.data.data.invoice;
                if (inv.customer?.id) setCustomerId(inv.customer.id);
                setInvoiceId(inv.id);
                if (inv.taxRate != null) setTaxRate(Number(inv.taxRate));
                if (inv.taxLabel) setTaxLabel(inv.taxLabel);
                if (Array.isArray(inv.items) && inv.items.length) {
                    setItems(
                        inv.items.map((it: any) => ({
                            name: it.name ?? "",
                            description: it.description ?? "",
                            quantity: Number(it.quantity) || 0,
                            unitPrice: Number(it.unitPrice) || 0,
                        }))
                    );
                }
                setReason(`Credit against ${inv.invoiceNumber ?? "invoice"}`);
            })
            .catch(() => !cancelled && setError("Could not load the invoice to credit."));
        return () => {
            cancelled = true;
        };
    }, [prefillInvoiceId]);

    const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
    const tax = (subtotal * (Number(taxRate) || 0)) / 100;
    const total = subtotal + tax;

    const save = useMutation({
        mutationFn: () =>
            api.post("/credit-notes", {
                customerId,
                invoiceId: invoiceId || undefined,
                reason: reason || undefined,
                taxRate: Number(taxRate) || 0,
                taxLabel,
                items: items
                    .filter((i) => i.name.trim())
                    .map((i) => ({
                        name: i.name.trim(),
                        description: i.description?.trim() || undefined,
                        quantity: Number(i.quantity) || 0,
                        unitPrice: Number(i.unitPrice) || 0,
                    })),
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["credit-notes"] });
            onClose();
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not save the credit note."),
    });

    const updateItem = (idx: number, patch: Partial<LineItem>) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

    const canSave =
        !!customerId && items.some((i) => i.name.trim()) && !save.isPending;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
            <div className="surface-card w-full max-w-2xl bg-white p-5 mt-8 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5" /> New credit note
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500">Customer</label>
                        <select
                            value={customerId}
                            onChange={(e) => {
                                setCustomerId(e.target.value);
                                setInvoiceId("");
                            }}
                            className="mt-1 w-full rounded border px-3 py-2 text-sm"
                        >
                            <option value="">Select customer…</option>
                            {customers.map((c: any) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500">Invoice (optional)</label>
                        <select
                            value={invoiceId}
                            onChange={(e) => setInvoiceId(e.target.value)}
                            disabled={!customerId}
                            className="mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
                        >
                            <option value="">No specific invoice</option>
                            {customerInvoices.map((inv: any) => (
                                <option key={inv.id} value={inv.id}>
                                    {inv.invoiceNumber ?? inv.id.slice(0, 8)} — {money(Number(inv.total))}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Line items — same columns as the invoice line-item table */}
                <div className="rounded border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                            <tr>
                                <th className="px-3 py-2">Item</th>
                                <th className="px-2 py-2 w-20 text-right">Qty</th>
                                <th className="px-2 py-2 w-28 text-right">Unit price</th>
                                <th className="px-2 py-2 w-28 text-right">Total</th>
                                <th className="w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, idx) => (
                                <tr key={idx} className="border-t align-top">
                                    <td className="px-3 py-2">
                                        <input
                                            value={it.name}
                                            onChange={(e) => updateItem(idx, { name: e.target.value })}
                                            placeholder="Description"
                                            className="w-full rounded border px-2 py-1 text-sm"
                                        />
                                        <input
                                            value={it.description ?? ""}
                                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                                            placeholder="Note (optional)"
                                            className="mt-1 w-full rounded border px-2 py-1 text-xs text-slate-500"
                                        />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        <input
                                            type="number"
                                            min={0}
                                            value={it.quantity}
                                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                                            className="w-16 rounded border px-2 py-1 text-sm text-right"
                                        />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={it.unitPrice}
                                            onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                                            className="w-24 rounded border px-2 py-1 text-sm text-right"
                                        />
                                    </td>
                                    <td className="px-2 py-2 text-right font-medium">
                                        {money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        {items.length > 1 && (
                                            <button
                                                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                                                className="text-slate-400 hover:text-rose-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button
                        onClick={() => setItems((p) => [...p, blankLine()])}
                        className="flex items-center gap-1 px-3 py-2 text-xs text-blue-600 hover:underline"
                    >
                        <Plus className="h-3 w-3" /> Add line
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-medium text-slate-500">Reason (optional)</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            className="mt-1 w-full rounded border px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Subtotal (excl. {taxLabel})</span>
                            <span>{money(subtotal)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500 flex items-center gap-1">
                                {taxLabel}
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={taxRate}
                                    onChange={(e) => setTaxRate(Number(e.target.value))}
                                    className="w-14 rounded border px-1.5 py-0.5 text-xs text-right"
                                />
                                %
                            </span>
                            <span>{money(tax)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1.5 font-semibold">
                            <span>Total credit</span>
                            <span>{money(total)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                        Cancel
                    </button>
                    <button
                        onClick={() => save.mutate()}
                        disabled={!canSave}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {save.isPending ? "Saving…" : "Save draft"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function CreditNotesPage() {
    const qc = useQueryClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showForm, setShowForm] = useState(false);
    const [prefillInvoiceId, setPrefillInvoiceId] = useState<string | null>(null);

    // Deep-link from the invoice page: /credit-notes?fromInvoice=<id>.
    useEffect(() => {
        const from = searchParams.get("fromInvoice");
        if (from) {
            setPrefillInvoiceId(from);
            setShowForm(true);
            router.replace("/credit-notes");
        }
    }, [searchParams, router]);

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ["credit-notes"],
        queryFn: () => api.get("/credit-notes").then((r) => r.data.data.notes),
    });
    const issue = useMutation({
        mutationFn: (id: string) => api.post(`/credit-notes/${id}/issue`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["credit-notes"] }),
    });
    const apply = useMutation({
        mutationFn: (id: string) => api.post(`/credit-notes/${id}/apply`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["credit-notes"] }),
    });

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <FileText className="h-6 w-6" /> Credit notes
                    </h1>
                    <p className="page-subtitle">SARS-compliant credit notes to offset invoices.</p>
                </div>
                <button
                    onClick={() => {
                        setPrefillInvoiceId(null);
                        setShowForm(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                >
                    <Plus className="h-4 w-4" /> New credit note
                </button>
            </div>
            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2">Number</th>
                            <th>Customer</th>
                            <th>Invoice</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {notes.map((n: any) => (
                            <tr key={n.id} className="border-t">
                                <td className="px-4 py-2 font-mono text-xs">{n.number ?? "—"}</td>
                                <td>{n.customer?.name}</td>
                                <td>{n.invoice?.invoiceNumber ?? <span className="text-slate-400 italic">—</span>}</td>
                                <td>R {Number(n.total).toFixed(2)}</td>
                                <td>
                                    <span className={`text-xs uppercase px-2 py-0.5 rounded ${
                                        n.status === "APPLIED" ? "bg-emerald-100 text-emerald-700" :
                                        n.status === "ISSUED" ? "bg-blue-100 text-blue-700" :
                                        n.status === "VOID" ? "bg-rose-100 text-rose-700" :
                                        "bg-slate-100 text-slate-700"
                                    }`}>{n.status}</span>
                                </td>
                                <td className="space-x-2">
                                    {n.status === "DRAFT" && (
                                        <button onClick={() => issue.mutate(n.id)} className="text-xs text-blue-600 hover:underline">Issue</button>
                                    )}
                                    {n.status === "ISSUED" && n.invoiceId && (
                                        <button onClick={() => apply.mutate(n.id)} className="text-xs text-emerald-600 hover:underline">Apply</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {notes.length === 0 && !isLoading && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400 italic">No credit notes yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <NewCreditNoteDialog
                    prefillInvoiceId={prefillInvoiceId}
                    onClose={() => {
                        setShowForm(false);
                        setPrefillInvoiceId(null);
                    }}
                />
            )}
        </div>
    );
}
