"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import {
    AlertTriangle,
    Minus,
    Package,
    Plus,
    Search,
    Truck,
} from "lucide-react";
import { cn } from "../../../../lib/utils";

interface InventoryItem {
    id: string;
    name: string;
    sku: string | null;
    quantity: number;
    minLevel: number;
    // unitCost is intentionally not exposed to technicians — the API strips it.
    location: "WAREHOUSE" | "VAN";
}

interface VanInfo {
    id: string;
    name: string;
    registration?: string | null;
    members: {
        id: string;
        role: string;
        user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
    }[];
}

export default function MyVanStockPage() {
    const qc = useQueryClient();
    const [query, setQuery] = useState("");

    const { data: vanData } = useQuery<VanInfo | null>({
        queryKey: ["my-van"],
        queryFn: () => api.get("/vans/my-van").then((r) => r.data.data.van),
    });

    const { data: items = [] } = useQuery<InventoryItem[]>({
        queryKey: ["van-inventory", vanData?.id],
        queryFn: () =>
            api
                .get(`/vans/${vanData!.id}/inventory`)
                .then((r) => r.data.data.items),
        enabled: !!vanData?.id,
    });

    const filtered = useMemo(
        () =>
            items.filter((i) =>
                query
                    ? `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(query.toLowerCase())
                    : true
            ),
        [items, query]
    );

    const lowCount = items.filter((i) => i.quantity <= i.minLevel).length;
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

    const updateQuantity = async (id: string, newQty: number) => {
        if (newQty < 0) return;
        await api.patch(`/operations/inventory/${id}`, { quantity: newQty });
        qc.invalidateQueries({ queryKey: ["van-inventory"] });
    };

    if (!vanData) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="page-title">My Van Stock</h1>
                    <p className="page-subtitle">Track parts and materials on your van.</p>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Truck className="h-10 w-10 text-slate-300" />
                        <p className="mt-3 text-sm font-medium">Not assigned to a van</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ask your dispatcher or admin to assign you to a van.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">{vanData.name} — Stock</h1>
                <p className="page-subtitle">
                    {vanData.registration ? `${vanData.registration} · ` : ""}
                    {vanData.members.length} team member{vanData.members.length !== 1 ? "s" : ""}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600">
                            <Package className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{items.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Items on van</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-rose-50 text-rose-600">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{lowCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Low stock</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600">
                            <Package className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">
                            {totalUnits}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total units</p>
                </div>
            </div>

            <div className="surface-card p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search parts on your van…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
            </div>

            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={4}>
                                    <div className="flex flex-col items-center py-16 text-center">
                                        <Package className="h-8 w-8 text-slate-300" />
                                        <p className="mt-3 text-sm font-medium">No stock found</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {items.length === 0
                                                ? "Your van has no stock assigned yet."
                                                : "Adjust your search."}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filtered.map((item) => {
                                const low = item.quantity <= item.minLevel;
                                return (
                                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                                        <td className="px-6 py-3.5">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Threshold: {item.minLevel}
                                            </p>
                                        </td>
                                        <td className="px-6 py-3.5 text-sm font-mono text-muted-foreground">
                                            {item.sku || "—"}
                                        </td>
                                        <td className="px-6 py-3.5">
                                            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white">
                                                <button
                                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                    className="h-7 w-7 flex items-center justify-center hover:bg-slate-50 rounded-l-lg"
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-10 text-center text-sm font-medium tabular-nums">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                    className="h-7 w-7 flex items-center justify-center hover:bg-slate-50 rounded-r-lg"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3.5">
                                            {low ? (
                                                <span className="status-pill bg-rose-50 text-rose-700 ring-rose-200">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Low stock
                                                </span>
                                            ) : (
                                                <span className="status-pill bg-emerald-50 text-emerald-700 ring-emerald-200">
                                                    <span className="status-pill-dot bg-emerald-500" />
                                                    In stock
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
