"use client";

import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import type { PriceBookItem } from "./types";

interface PriceBookResponse {
    items: PriceBookItem[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/** Load the whole company price book into the persisted query cache so field
 *  quoting and line-item search work with no signal. Techs see item names/SKUs
 *  only — the API strips pricing for the TECHNICIAN role. Callers filter the
 *  returned array client-side for search. */
export function usePriceBook(): PriceBookItem[] {
    const { data } = useQuery({
        queryKey: ["price-book", "all"],
        queryFn: async () => {
            const res = await api.get("/price-book?limit=500");
            return (res.data?.data?.items ?? []) as PriceBookItem[];
        },
        // The price book changes rarely; keep it fresh for an hour and cached on
        // device for a day so it survives reloads offline.
        staleTime: 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
    });

    return data ?? [];
}

export type { PriceBookResponse };
