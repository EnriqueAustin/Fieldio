"use client";

import type { Dispatch, SetStateAction } from "react";
import { FileText, Package, Plus, Search, Send, Trash2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import type { PriceBookItem, QuoteDraftItem, TechnicianJob } from "./types";

interface QuoteCardProps {
    job: TechnicianJob;
    priceBookItems: PriceBookItem[];
    quoteSearch: string;
    setQuoteSearch: Dispatch<SetStateAction<string>>;
    quoteItems: QuoteDraftItem[];
    setQuoteItems: Dispatch<SetStateAction<QuoteDraftItem[]>>;
    onAddQuoteItem: (item: PriceBookItem) => void;
    onSendQuote: () => void;
    isSending: boolean;
}

export function QuoteCard({
    job,
    priceBookItems,
    quoteSearch,
    setQuoteSearch,
    quoteItems,
    setQuoteItems,
    onAddQuoteItem,
    onSendQuote,
    isSending,
}: QuoteCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Quote customer
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Spotted extra work? Build a quote from the price book and send {job.customer.name} an
                    approval link. Pricing is applied by the office — you just pick the work.
                </p>

                {/* Price book search for the quote */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        placeholder="Search price book to add to quote…"
                        value={quoteSearch}
                        onChange={(e) => setQuoteSearch(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                {quoteSearch && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border divide-y">
                        {priceBookItems
                            .filter((item) =>
                                item.name.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                                (item.sku && item.sku.toLowerCase().includes(quoteSearch.toLowerCase()))
                            )
                            .slice(0, 6)
                            .map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => onAddQuoteItem(item)}
                                    className="w-full flex items-center justify-between p-2.5 text-left hover:bg-slate-50 text-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        {item.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400" /> : <Wrench className="h-4 w-4 text-slate-400" />}
                                        <span className="font-medium">{item.name}</span>
                                    </div>
                                    <Plus className="h-4 w-4 text-slate-400" />
                                </button>
                            ))}
                    </div>
                )}

                {/* Draft quote lines */}
                {quoteItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                        No quote items yet. Search the price book above to start a quote.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {quoteItems.map((q, idx) => (
                            <div key={q.priceBookItemId ?? idx} className="flex items-center justify-between rounded-xl border p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    {q.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400 shrink-0" /> : <Wrench className="h-4 w-4 text-slate-400 shrink-0" />}
                                    <span className="font-medium text-sm truncate">{q.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={q.quantity}
                                        onChange={(e) => {
                                            const quantity = parseInt(e.target.value) || 1;
                                            setQuoteItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity } : p));
                                        }}
                                        className="w-16 rounded-lg border border-border px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button
                                        onClick={() => setQuoteItems((prev) => prev.filter((_, i) => i !== idx))}
                                        className="text-rose-500 hover:text-rose-600 transition"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end">
                    <Button
                        onClick={onSendQuote}
                        disabled={quoteItems.length === 0 || isSending}
                    >
                        <Send className="mr-2 h-4 w-4" />
                        {isSending ? "Sending…" : "Send quote to customer"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
