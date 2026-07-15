"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Search, Check } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import api from "../../lib/api";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onCreated: (estimateId: string) => void;
}

interface Customer {
    id: string;
    name: string;
}

interface PriceBookItem {
    id: string;
    name: string;
    unitPrice: number;
    type: string;
    category: string | null;
}

type Line = { name: string; quantity: number; unitPrice: number; type: string; priceBookItemId?: string };

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

export function CreateEstimateDialog({ open, onOpenChange, onCreated }: Props) {
    const [customerId, setCustomerId] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [lines, setLines] = useState<Line[]>([]);
    const [pbSearch, setPbSearch] = useState("");
    const [error, setError] = useState<string | null>(null);

    const { data: customers } = useQuery({
        queryKey: ["customers", "estimate-picker", customerSearch],
        queryFn: () =>
            api
                .get(`/customers?search=${encodeURIComponent(customerSearch)}`)
                .then((r) => r.data.data.items ?? []),
        enabled: open,
    });

    const { data: priceBook } = useQuery({
        queryKey: ["price-book", "estimate-picker"],
        queryFn: () => api.get("/price-book").then((r) => r.data.data.items ?? []),
        enabled: open,
    });

    const pbItems: PriceBookItem[] = priceBook ?? [];
    const filteredPb = useMemo(() => {
        const q = pbSearch.trim().toLowerCase();
        if (!q) return pbItems.slice(0, 8);
        return pbItems.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
    }, [pbItems, pbSearch]);

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

    const reset = () => {
        setCustomerId("");
        setCustomerName("");
        setCustomerSearch("");
        setValidUntil("");
        setLines([]);
        setPbSearch("");
        setError(null);
    };

    const addPbItem = (item: PriceBookItem) => {
        setLines((prev) => {
            const existing = prev.findIndex((l) => l.priceBookItemId === item.id);
            if (existing >= 0) {
                const next = [...prev];
                next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
                return next;
            }
            return [
                ...prev,
                {
                    name: item.name,
                    quantity: 1,
                    unitPrice: Number(item.unitPrice),
                    type: item.type ?? "SERVICE",
                    priceBookItemId: item.id,
                },
            ];
        });
        setPbSearch("");
    };

    const addBlank = () =>
        setLines((prev) => [...prev, { name: "", quantity: 1, unitPrice: 0, type: "SERVICE" }]);

    const updateLine = (idx: number, field: keyof Line, value: string | number) =>
        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

    const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

    const create = useMutation({
        mutationFn: () => {
            const items = lines.map((l) => ({
                name: l.name,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                total: l.quantity * l.unitPrice,
                type: l.type,
                priceBookItemId: l.priceBookItemId ?? null,
            }));
            return api
                .post("/finance/estimates", {
                    customerId,
                    items,
                    total: subtotal,
                    validUntil: validUntil || undefined,
                })
                .then((r) => r.data.data.estimate);
        },
        onSuccess: (estimate) => {
            onCreated(estimate.id);
            reset();
            onOpenChange(false);
        },
        onError: (e: any) => {
            setError(e?.response?.data?.message ?? "Could not create quote");
        },
    });

    const canSubmit = customerId && lines.length > 0 && lines.every((l) => l.name.trim());

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) reset();
                onOpenChange(v);
            }}
        >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New quote</DialogTitle>
                    <DialogDescription>
                        Pick a customer and add line items from your price book.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Customer picker */}
                    <div className="space-y-1.5">
                        <Label>Customer *</Label>
                        {customerId ? (
                            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                                <span className="font-medium">{customerName}</span>
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        setCustomerId("");
                                        setCustomerName("");
                                    }}
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        className="pl-9"
                                        placeholder="Search customers…"
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                    />
                                </div>
                                {(customers ?? []).length > 0 && (
                                    <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                                        {(customers as Customer[]).map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-50"
                                                onClick={() => {
                                                    setCustomerId(c.id);
                                                    setCustomerName(c.name);
                                                }}
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Price book picker */}
                    <div className="space-y-1.5">
                        <Label>Add from price book</Label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="Search items…"
                                value={pbSearch}
                                onChange={(e) => setPbSearch(e.target.value)}
                            />
                        </div>
                        {pbSearch && (
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                                {filteredPb.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                                ) : (
                                    filteredPb.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                                            onClick={() => addPbItem(item)}
                                        >
                                            <span className="truncate">{item.name}</span>
                                            <span className="text-muted-foreground shrink-0 ml-2">
                                                {formatCurrency(Number(item.unitPrice))}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Line items */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Line items</Label>
                            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={addBlank}>
                                <Plus className="mr-1 h-3 w-3" /> Custom item
                            </Button>
                        </div>
                        {lines.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                                No items yet. Add from the price book or a custom line.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lines.map((l, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                        <Input
                                            className="col-span-5"
                                            placeholder="Item name"
                                            value={l.name}
                                            onChange={(e) => updateLine(idx, "name", e.target.value)}
                                        />
                                        <Input
                                            className="col-span-2"
                                            type="number"
                                            min={1}
                                            value={l.quantity}
                                            onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                                        />
                                        <Input
                                            className="col-span-3"
                                            type="number"
                                            min={0}
                                            value={l.unitPrice}
                                            onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value))}
                                        />
                                        <div className="col-span-1 text-right text-xs text-muted-foreground">
                                            {formatCurrency(l.quantity * l.unitPrice)}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="col-span-1 h-8 w-8 text-destructive"
                                            onClick={() => removeLine(idx)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="valid-until">Valid until</Label>
                            <Input
                                id="valid-until"
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                            />
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground">Total</div>
                            <div className="text-xl font-bold">{formatCurrency(subtotal)}</div>
                        </div>
                    </div>

                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
                        {create.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="mr-2 h-4 w-4" />
                        )}
                        Create quote
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
