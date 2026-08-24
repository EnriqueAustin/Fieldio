"use client";

import type { Dispatch, SetStateAction } from "react";
import { Package, Plus, Search, Trash2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import type { PriceBookItem, TechnicianJob } from "./types";

interface NewLineItemDraft {
    name: string;
    quantity: number;
    type: string;
    priceBookItemId: string;
}

interface LineItemsCardProps {
    job: TechnicianJob;
    pbSearch: string;
    setPbSearch: Dispatch<SetStateAction<string>>;
    newItem: NewLineItemDraft;
    setNewItem: Dispatch<SetStateAction<NewLineItemDraft>>;
    filteredPB: PriceBookItem[];
    onSelectPBItem: (item: PriceBookItem) => void;
    onAddLineItem: () => void;
    onRemoveLineItem: (itemId: string) => void;
}

export function LineItemsCard({
    job,
    pbSearch,
    setPbSearch,
    newItem,
    setNewItem,
    filteredPB,
    onSelectPBItem,
    onAddLineItem,
    onRemoveLineItem,
}: LineItemsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Price book search */}
                <div className="rounded-xl border p-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            placeholder="Search price book (parts, services)…"
                            value={pbSearch}
                            onChange={(e) => setPbSearch(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 h-11 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    {filteredPB.length > 0 && (
                        <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                            {filteredPB.slice(0, 6).map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => onSelectPBItem(item)}
                                    className="w-full flex items-center justify-between gap-2 px-3 min-h-[44px] py-2 text-left hover:bg-slate-50 text-sm"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {item.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400 shrink-0" /> : <Wrench className="h-4 w-4 text-slate-400 shrink-0" />}
                                        <span className="font-medium truncate">{item.name}</span>
                                    </div>
                                    {item.sku && <span className="text-xs text-muted-foreground shrink-0">{item.sku}</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-[1fr,72px,auto] gap-2 items-end">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Item</label>
                            <input
                                placeholder="Name"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value, priceBookItemId: "" })}
                                className="w-full rounded-lg border border-border px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Qty</label>
                            <input
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                                className="w-full rounded-lg border border-border px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <Button
                            onClick={onAddLineItem}
                            disabled={!newItem.name}
                            className="h-11 w-11 shrink-0"
                            aria-label="Add line item"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Current line items */}
                {(!job.lineItems || job.lineItems.length === 0) ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                        No items added yet. Search the price book or add manually above.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {job.lineItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    {item.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400 shrink-0" /> : <Wrench className="h-4 w-4 text-slate-400 shrink-0" />}
                                    <div className="min-w-0">
                                        <div className="font-medium text-sm truncate">{item.name}</div>
                                        <div className="text-xs text-muted-foreground">Qty: {item.quantity}</div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onRemoveLineItem(item.id)}
                                    aria-label={`Remove ${item.name}`}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
