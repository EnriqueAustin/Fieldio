"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";
import type { PriceBookItem } from "./types";

/** Line-item drafting + add/remove mutations. Pricing is set by the office; the
 *  tech only records the item and quantity (unitPrice 0, resolved server-side). */
export function useLineItems(priceBookItems: PriceBookItem[]) {
    const [pbSearch, setPbSearch] = useState("");
    const [newItem, setNewItem] = useState({ name: "", quantity: 1, type: "SERVICE" as string, priceBookItemId: "" });

    const lineItemMutation = useMutation<unknown, any, { jobId: string; name: string; quantity: number; unitPrice: number; type: string; priceBookItemId?: string }>({
        mutationKey: OFFLINE_KEYS.lineItemAdd,
        onError: () => {
            toast({ title: "Could not add line item", variant: "destructive" });
        },
    });

    const removeLineItemMutation = useMutation<unknown, any, { jobId: string; itemId: string }>({
        mutationKey: OFFLINE_KEYS.lineItemRemove,
    });

    const filteredPB = priceBookItems.filter(
        (item) => pbSearch && (
            item.name.toLowerCase().includes(pbSearch.toLowerCase()) ||
            (item.sku && item.sku.toLowerCase().includes(pbSearch.toLowerCase()))
        )
    );

    const selectPBItem = (item: PriceBookItem) => {
        setNewItem({ name: item.name, quantity: 1, type: item.type, priceBookItemId: item.id });
        setPbSearch("");
    };

    const addLineItem = (jobId: string) => {
        if (!newItem.name) return;
        // Pricing is set by the office. Techs only record the item and
        // quantity; the API resolves the real price from the price book
        // entry (priceBookItemId) or leaves it for the office to price.
        lineItemMutation.mutate({
            jobId,
            name: newItem.name,
            quantity: newItem.quantity,
            unitPrice: 0,
            type: newItem.type,
            priceBookItemId: newItem.priceBookItemId || undefined,
        });
        setNewItem({ name: "", quantity: 1, type: "SERVICE", priceBookItemId: "" });
        setPbSearch("");
    };

    const removeLineItem = (jobId: string, itemId: string) => {
        removeLineItemMutation.mutate({ jobId, itemId });
    };

    return { pbSearch, setPbSearch, newItem, setNewItem, filteredPB, selectPBItem, addLineItem, removeLineItem };
}
