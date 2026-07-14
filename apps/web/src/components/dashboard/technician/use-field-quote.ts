"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";
import type { PriceBookItem, QuoteDraftItem } from "./types";

/**
 * Field quoting: tech picks price-book items + qty only; the server prices it
 * and sends the customer an approval link. Prices are never shown here.
 */
export function useFieldQuote() {
    const [quoteSearch, setQuoteSearch] = useState("");
    const [quoteItems, setQuoteItems] = useState<QuoteDraftItem[]>([]);

    // Field quote runs through the offline queue (OFFLINE_KEYS.fieldQuote): fired
    // with no signal it is paused, persisted, and replayed on reconnect — same as
    // status/photo/line-item actions. onSuccess only fires when the request
    // actually lands (online now, or after reconnect while still mounted).
    const quoteMutation = useMutation<unknown, any, { jobId: string; items: QuoteDraftItem[] }>({
        mutationKey: OFFLINE_KEYS.fieldQuote,
        onSuccess: () => {
            toast({ title: "Quote sent to customer", description: "They’ll get an approval link by SMS/email." });
            setQuoteItems([]);
            setQuoteSearch("");
        },
        onError: (error: any) => {
            toast({
                title: "Could not send quote",
                description: error?.response?.data?.message ?? "Please try again when you have signal.",
                variant: "destructive",
            });
        },
    });

    /** Send the on-site quote. Offline, the mutation queues; we clear the draft
     *  and tell the tech it will send on reconnect. Online, we keep the draft
     *  until onSuccess confirms delivery (and clear it on failure-free landing). */
    const sendQuote = (jobId: string) => {
        if (quoteItems.length === 0) return;
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        quoteMutation.mutate({ jobId, items: quoteItems });
        if (offline) {
            setQuoteItems([]);
            setQuoteSearch("");
            toast({
                title: "Quote queued",
                description: "No signal — it’ll send automatically when you’re back online.",
            });
        }
    };

    const addQuoteItem = (item: PriceBookItem) => {
        setQuoteItems((prev) => {
            const existing = prev.find((q) => q.priceBookItemId === item.id);
            if (existing) {
                return prev.map((q) => q.priceBookItemId === item.id ? { ...q, quantity: q.quantity + 1 } : q);
            }
            return [...prev, { priceBookItemId: item.id, name: item.name, quantity: 1, type: item.type }];
        });
        setQuoteSearch("");
    };

    return { quoteSearch, setQuoteSearch, quoteItems, setQuoteItems, addQuoteItem, quoteMutation, sendQuote };
}
