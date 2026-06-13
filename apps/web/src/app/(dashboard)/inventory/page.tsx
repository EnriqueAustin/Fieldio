"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Plus, AlertTriangle, Package, Search, Minus, Warehouse, Truck } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "../../../lib/utils";

interface VanOption {
    id: string;
    name: string;
}

interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    minLevel: number;
    unitCost: string | null;
    location: "WAREHOUSE" | "VAN";
    van?: { id: string; name: string } | null;
}

const createItemSchema = z.object({
    name: z.string().min(2),
    quantity: z.string().transform((v) => parseInt(v)),
    minLevel: z
        .string()
        .transform((v) => parseInt(v))
        .optional(),
});

export default function InventoryPage() {
    const qc = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"ALL" | "LOW" | "WAREHOUSE" | "VAN">("ALL");
    const [vanFilter, setVanFilter] = useState<string>("ALL");
    const { register, handleSubmit, reset } = useForm({ resolver: zodResolver(createItemSchema) });

    const { data } = useQuery({
        queryKey: ["inventory"],
        queryFn: () => api.get("/operations/inventory").then((res) => res.data.data.items as InventoryItem[]),
    });
    const items: InventoryItem[] = data ?? [];

    const { data: vansData } = useQuery<VanOption[]>({
        queryKey: ["vans-list"],
        queryFn: () => api.get("/vans").then((r) => (r.data.data.vans as any[]).map((v: any) => ({ id: v.id, name: v.name }))),
    });
    const vanOptions: VanOption[] = vansData ?? [];

    const onSubmit = async (data: any) => {
        await api.post("/operations/inventory", { ...data, minLevel: data.minLevel || 5 });
        void qc.invalidateQueries({ queryKey: ["inventory"] });
        setIsDialogOpen(false);
        reset();
    };

    const updateQuantity = async (id: string, newQty: number) => {
        if (newQty < 0) return;
        await api.patch(`/operations/inventory/${id}`, { quantity: newQty });
        void qc.invalidateQueries({ queryKey: ["inventory"] });
    };

    const filtered = useMemo(() => {
        return items
            .filter((i) => {
                if (filter === "LOW") return i.quantity <= i.minLevel;
                if (filter === "WAREHOUSE") return i.location === "WAREHOUSE";
                if (filter === "VAN") return i.location === "VAN";
                return true;
            })
            .filter((i) => {
                if (vanFilter === "ALL") return true;
                if (vanFilter === "WAREHOUSE") return !i.van;
                return i.van?.id === vanFilter;
            })
            .filter((i) =>
                query
                    ? `${i.name} ${i.sku}`.toLowerCase().includes(query.toLowerCase())
                    : true
            );
    }, [items, filter, vanFilter, query]);

    const lowStockCount = items.filter((i) => i.quantity <= i.minLevel).length;
    const totalValue = items.reduce((acc, i) => acc + i.quantity, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Inventory</h1>
                    <p className="page-subtitle">
                        Track parts on trucks and in the warehouse.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800">
                            <Plus className="h-4 w-4" /> Add item
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add inventory item</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Item name</Label>
                                <Input {...register("name")} placeholder='e.g. Copper Pipe 1/2"' />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Quantity</Label>
                                    <Input type="number" {...register("quantity")} defaultValue="0" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Low-stock at</Label>
                                    <Input type="number" {...register("minLevel")} defaultValue="5" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Create</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-slate-100 text-slate-600">
                            <Package className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{items.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total SKUs</p>
                    <p className="text-xs text-muted-foreground">{totalValue} units in stock</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-rose-50 text-rose-600">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{lowStockCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Low stock</p>
                    <p className="text-xs text-muted-foreground">Items at or below threshold</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600">
                            <Truck className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">
                            {items.filter((i) => i.location === "VAN").length}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-medium">On vans</p>
                    <p className="text-xs text-muted-foreground">Allocated to technicians</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="surface-card p-3 flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or SKU…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
                <div className="flex items-center gap-1">
                    {(["ALL", "LOW", "WAREHOUSE", "VAN"] as const).map((f) => {
                        const active = filter === f;
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                    active
                                        ? "bg-slate-900 text-white"
                                        : "text-muted-foreground hover:bg-slate-100"
                                )}
                            >
                                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                            </button>
                        );
                    })}
                </div>
                {vanOptions.length > 0 && (
                    <select
                        value={vanFilter}
                        onChange={(e) => setVanFilter(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium"
                    >
                        <option value="ALL">All locations</option>
                        <option value="WAREHOUSE">Warehouse only</option>
                        {vanOptions.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Table */}
            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Item
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                SKU
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Location
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Quantity
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="flex flex-col items-center text-center py-16">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                            <Package className="h-5 w-5" />
                                        </div>
                                        <p className="mt-3 text-sm font-medium">No items match</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Add an item or adjust your filters.
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
                                            <span className="inline-flex items-center gap-1.5 text-xs">
                                                {item.location === "WAREHOUSE" ? (
                                                    <Warehouse className="h-3.5 w-3.5 text-slate-500" />
                                                ) : (
                                                    <Truck className="h-3.5 w-3.5 text-blue-500" />
                                                )}
                                                {item.van ? item.van.name : item.location === "WAREHOUSE" ? "Warehouse" : "Van"}
                                            </span>
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
