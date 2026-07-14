"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../../lib/api";
import { toast } from "../../ui/use-toast";
import type { PriceBookItem, QuoteDraftItem } from "./types";

/**
 * Field quoting: tech picks price-book items + qty only; the server prices it
 * and sends the customer an approval link. Prices are never shown here.
 */
export function useFieldQuote() {
    const [quoteSearch, setQuoteSearch] = useState("");
    const [quoteItems, setQuoteItems] = useState<QuoteDraftItem[]>([]);

    const quoteMutation = useMutation<unknown, any, { jobId: string; items: QuoteDraftItem[] }>({
        mutationFn: async (vars) => (await api.post("/finance/estimates/field", vars)).data,
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

    return { quoteSearch, setQuoteSearch, quoteItems, setQuoteItems, addQuoteItem, quoteMutation };
}
