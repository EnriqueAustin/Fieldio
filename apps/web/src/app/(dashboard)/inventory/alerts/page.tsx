"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { AlertTriangle, FileText, Check, Truck, Warehouse } from "lucide-react";

interface Alert {
    id: string;
    vanId?: string | null;
    van?: { id: string; name: string } | null;
    inventoryItemId: string;
    message: string;
    currentQty: number;
    targetQty: number;
    createdAt: string;
}

export default function LowStockAlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchAlerts = async () => {
        const r = await api.get("/inventory-alerts?status=OPEN");
        setAlerts(r.data.data.alerts);
    };

    useEffect(() => { fetchAlerts(); }, []);

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const selectAll = () => {
        if (selected.size === alerts.length) setSelected(new Set());
        else setSelected(new Set(alerts.map(a => a.id)));
    };

    const draftPO = async () => {
        setError(null); setResult(null); setBusy(true);
        try {
            const r = await api.post("/inventory-alerts/create-po", { alertIds: Array.from(selected) });
            const pos = r.data.data.purchaseOrders;
            const skipped = r.data.data.skipped as string[];
            setResult(`Drafted ${pos.length} PO${pos.length === 1 ? '' : 's'} (${pos.map((p: any) => p.orderNumber).join(', ')})${skipped.length ? ` — skipped (no supplier): ${skipped.join(', ')}` : ''}`);
            setSelected(new Set());
            fetchAlerts();
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to draft PO");
        } finally { setBusy(false); }
    };

    const acknowledge = async (id: string) => {
        await api.post(`/inventory-alerts/${id}/acknowledge`);
        fetchAlerts();
    };

    const selectedCount = selected.size;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Low-stock alerts</h1>
                    <p className="page-subtitle">
                        One click drafts a purchase order to each item's default supplier.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={selectAll} disabled={alerts.length === 0}>
                        {selected.size === alerts.length && alerts.length > 0 ? 'Clear' : 'Select all'}
                    </Button>
                    <Button onClick={draftPO} disabled={busy || selectedCount === 0}>
                        <FileText className="mr-2 h-4 w-4" />
                        {busy ? 'Drafting…' : `Draft PO${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                    </Button>
                </div>
            </div>

            {result && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {result}
                </div>
            )}
            {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {error}
                </div>
            )}

            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-3 w-10"></th>
                            <th className="px-4 py-3 text-left">Item</th>
                            <th className="px-4 py-3 text-left">Location</th>
                            <th className="px-4 py-3 text-left">On hand</th>
                            <th className="px-4 py-3 text-left">Target</th>
                            <th className="px-4 py-3 text-left">Created</th>
                            <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {alerts.length === 0 ? (
                            <tr><td colSpan={7}>
                                <div className="flex flex-col items-center text-center py-16">
                                    <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                                        <Check className="h-5 w-5" />
                                    </div>
                                    <p className="mt-3 text-sm font-medium">All stock levels look healthy</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Alerts appear here when an item drops below its par level.
                                    </p>
                                </div>
                            </td></tr>
                        ) : alerts.map(a => {
                            const checked = selected.has(a.id);
                            return (
                                <tr key={a.id} className={checked ? 'bg-amber-50/40' : 'hover:bg-slate-50/70 transition'}>
                                    <td className="px-4 py-3">
                                        <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                            {a.message}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <span className="inline-flex items-center gap-1.5 text-xs">
                                            {a.van ? (
                                                <><Truck className="h-3.5 w-3.5 text-blue-500" /> {a.van.name}</>
                                            ) : (
                                                <><Warehouse className="h-3.5 w-3.5 text-slate-500" /> Warehouse</>
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm tabular-nums">{a.currentQty}</td>
                                    <td className="px-4 py-3 text-sm tabular-nums">{a.targetQty}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {new Date(a.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => acknowledge(a.id)}>
                                            Acknowledge
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
