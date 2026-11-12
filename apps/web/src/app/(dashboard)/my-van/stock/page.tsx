"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { OFFLINE_KEYS } from "../../../../lib/offline-mutations";
import { Card, CardContent } from "../../../../components/ui/card";
import {
    AlertTriangle,
    Check,
    ClipboardList,
    Minus,
    Package,
    PackagePlus,
    Plus,
    Search,
    Truck,
    X,
} from "lucide-react";

interface InventoryItem {
    id: string;
    name: string;
    sku: string | null;
    quantity: number;
    minLevel: number;
    // unitCost is intentionally not exposed to technicians — the API strips it.
    location: "WAREHOUSE" | "VAN";
}

interface ActiveJob {
    id: string;
    title: string;
    status: string;
    customer?: { name: string } | null;
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
    const [query, setQuery] = useState("");
    const [requested, setRequested] = useState<Record<string, boolean>>({});
    // "Use on job" sheet state.
    const [usingItem, setUsingItem] = useState<InventoryItem | null>(null);
    const [useQty, setUseQty] = useState(1);
    const [useJobId, setUseJobId] = useState<string | null>(null);

    const {
        data: vanData,
        isLoading: vanLoading,
        isError: vanError,
    } = useQuery<VanInfo | null>({
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

    // All three stock writes go through the shared offline mutation defaults
    // (optimistic cache patch, per-action Idempotency-Key, FIFO replay) so they
    // persist across reload, replay in order on reconnect, and never double-apply.
    const adjustMutation = useMutation<unknown, any, { vanId: string; itemId: string; delta: number }>({
        mutationKey: OFFLINE_KEYS.vanStockAdjust,
    });

    const restockMutation = useMutation<unknown, any, { vanId: string; itemId: string }>({
        mutationKey: OFFLINE_KEYS.vanRestock,
    });

    // Tech's own active jobs, fetched only while the "Use on job" sheet is open.
    const { data: activeJobs = [] } = useQuery<ActiveJob[]>({
        queryKey: ["my-active-jobs"],
        queryFn: () =>
            api.get("/jobs/assigned/me").then((r) =>
                (r.data?.data?.jobs ?? []).filter(
                    (j: ActiveJob) => j.status !== "COMPLETED" && j.status !== "CANCELED"
                )
            ),
        enabled: !!usingItem,
    });

    const useStockMutation = useMutation<unknown, any, { vanId: string; itemId: string; jobId: string; quantity: number }>({
        mutationKey: OFFLINE_KEYS.vanStockUse,
    });

    // Stepper: a signed delta is race-safe (two crew members each tapping -1 both
    // apply). The optimistic patch lives in the mutation default.
    const adjustQuantity = (item: InventoryItem, delta: number) => {
        if (!vanData) return;
        if (item.quantity + delta < 0) return;
        adjustMutation.mutate({ vanId: vanData.id, itemId: item.id, delta });
    };

    const openUseSheet = (item: InventoryItem) => {
        setUsingItem(item);
        setUseQty(1);
        setUseJobId(null);
    };
    const closeUseSheet = () => {
        setUsingItem(null);
        setUseJobId(null);
    };

    if (!vanData) {
        // vanData === null  → the server said this user is on no van.
        // vanData undefined → not loaded: offline with no cached van, or a fetch
        //   error. Don't mislabel that as "not assigned to a van".
        const offlineNoCache = vanData === undefined && (vanError || vanLoading);
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="page-title">My Van Stock</h1>
                    <p className="page-subtitle">Track parts and materials on your van.</p>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Truck className="h-10 w-10 text-slate-300" />
                        {offlineNoCache ? (
                            <>
                                <p className="mt-3 text-sm font-medium">Van details not available offline</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Reconnect to load your van and its stock.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="mt-3 text-sm font-medium">Not assigned to a van</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ask your dispatcher or admin to assign you to a van.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Reusable +/- stepper (≥44px targets).
    const Stepper = ({ item }: { item: InventoryItem }) => (
        <div className="inline-flex items-center rounded-xl border border-border bg-white">
            <button
                aria-label={`Decrease ${item.name}`}
                onClick={() => adjustQuantity(item, -1)}
                disabled={item.quantity <= 0}
                className="flex h-11 w-11 items-center justify-center rounded-l-xl hover:bg-slate-50 disabled:opacity-40 active:scale-95"
            >
                <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-base font-semibold tabular-nums">
                {item.quantity}
            </span>
            <button
                aria-label={`Increase ${item.name}`}
                onClick={() => adjustQuantity(item, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-r-xl hover:bg-slate-50 active:scale-95"
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    );

    const UseOnJobButton = ({ item, className = "" }: { item: InventoryItem; className?: string }) => (
        <button
            onClick={() => openUseSheet(item)}
            disabled={item.quantity <= 0}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium transition hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${className}`}
        >
            <ClipboardList className="h-4 w-4" /> Use on job
        </button>
    );

    const RestockButton = ({ item, className = "" }: { item: InventoryItem; className?: string }) => {
        const done = requested[item.id];
        return (
            <button
                onClick={() => {
                    if (done) return;
                    restockMutation.mutate({ vanId: vanData.id, itemId: item.id });
                    // Optimistic: the request queues offline, so confirm straight away.
                    setRequested((r) => ({ ...r, [item.id]: true }));
                }}
                disabled={done}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition active:scale-95 disabled:active:scale-100 ${
                    done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                } ${className}`}
            >
                {done ? (
                    <>
                        <Check className="h-4 w-4" /> Restock requested
                    </>
                ) : (
                    <>
                        <PackagePlus className="h-4 w-4" /> Request restock
                    </>
                )}
            </button>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">{vanData.name} — Stock</h1>
                <p className="page-subtitle">
                    {vanData.registration ? `${vanData.registration} · ` : ""}
                    {vanData.members.length} team member{vanData.members.length !== 1 ? "s" : ""}
                </p>
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-4">
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600">
                            <Package className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{items.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Items on van</p>
                </div>
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-rose-50 text-rose-600">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{lowCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Low stock</p>
                </div>
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600">
                            <Package className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{totalUnits}</span>
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
                        className="min-h-[44px] w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
            </div>

            {/* Mobile: card list (default below md) */}
            <div className="space-y-3 md:hidden">
                {filtered.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <Package className="h-8 w-8 text-slate-300" />
                            <p className="mt-3 text-sm font-medium">No stock found</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {items.length === 0
                                    ? "Your van has no stock assigned yet."
                                    : "Adjust your search."}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filtered.map((item) => {
                        const low = item.quantity <= item.minLevel;
                        return (
                            <div
                                key={item.id}
                                className={`rounded-2xl border bg-white p-4 ${
                                    low ? "border-rose-200" : "border-border"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold leading-tight">{item.name}</p>
                                        <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                                            {item.sku || "No SKU"}
                                        </p>
                                    </div>
                                    {low ? (
                                        <span className="status-pill shrink-0 bg-rose-50 text-rose-700 ring-rose-200">
                                            <AlertTriangle className="h-3 w-3" />
                                            Low
                                        </span>
                                    ) : (
                                        <span className="status-pill shrink-0 bg-emerald-50 text-emerald-700 ring-emerald-200">
                                            <span className="status-pill-dot bg-emerald-500" />
                                            In stock
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <Stepper item={item} />
                                    <span className="text-xs text-muted-foreground">
                                        Min {item.minLevel}
                                    </span>
                                </div>

                                <div className="mt-3 flex flex-col gap-2">
                                    <UseOnJobButton item={item} className="w-full" />
                                    {low && <RestockButton item={item} className="w-full" />}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Desktop: table (md and up) */}
            <div className="surface-card hidden overflow-hidden md:block">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                            <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
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
                                            <Stepper item={item} />
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
                                        <td className="px-6 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <UseOnJobButton item={item} />
                                                {low && <RestockButton item={item} />}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* "Use on job" sheet: pick a job, set quantity, log the draw. */}
            {usingItem && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
                    <div className="absolute inset-0 bg-black/40" onClick={closeUseSheet} />
                    <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold leading-tight">Use on job</h2>
                                <p className="text-sm text-muted-foreground">
                                    {usingItem.name} · {usingItem.quantity} on van
                                </p>
                            </div>
                            <button
                                aria-label="Close"
                                onClick={closeUseSheet}
                                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Quantity */}
                        <div className="mt-5 flex items-center justify-between">
                            <span className="text-sm font-medium">Quantity used</span>
                            <div className="inline-flex items-center rounded-xl border border-border bg-white">
                                <button
                                    aria-label="Decrease quantity"
                                    onClick={() => setUseQty((q) => Math.max(1, q - 1))}
                                    disabled={useQty <= 1}
                                    className="flex h-11 w-11 items-center justify-center rounded-l-xl hover:bg-slate-50 disabled:opacity-40 active:scale-95"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-12 text-center text-base font-semibold tabular-nums">{useQty}</span>
                                <button
                                    aria-label="Increase quantity"
                                    onClick={() => setUseQty((q) => Math.min(usingItem.quantity, q + 1))}
                                    disabled={useQty >= usingItem.quantity}
                                    className="flex h-11 w-11 items-center justify-center rounded-r-xl hover:bg-slate-50 disabled:opacity-40 active:scale-95"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Job picker */}
                        <div className="mt-5">
                            <span className="text-sm font-medium">Which job?</span>
                            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                                {activeJobs.length === 0 ? (
                                    <p className="py-4 text-center text-sm text-muted-foreground">
                                        No active jobs assigned to you.
                                    </p>
                                ) : (
                                    activeJobs.map((j) => (
                                        <button
                                            key={j.id}
                                            onClick={() => setUseJobId(j.id)}
                                            className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition ${
                                                useJobId === j.id
                                                    ? "border-blue-500 bg-blue-50"
                                                    : "border-border hover:bg-slate-50"
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{j.title}</p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {j.customer?.name ?? ""}
                                                </p>
                                            </div>
                                            {useJobId === j.id && <Check className="h-5 w-5 shrink-0 text-blue-600" />}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (!useJobId) return;
                                useStockMutation.mutate({
                                    vanId: vanData.id,
                                    itemId: usingItem.id,
                                    jobId: useJobId,
                                    quantity: useQty,
                                });
                                // Optimistic patch happens in the mutation default; the
                                // draw queues offline, so close the sheet immediately.
                                // Any sync failure surfaces in the offline outbox.
                                closeUseSheet();
                            }}
                            disabled={!useJobId}
                            className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                        >
                            <ClipboardList className="h-4 w-4" />
                            {`Use ${useQty} on job`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
