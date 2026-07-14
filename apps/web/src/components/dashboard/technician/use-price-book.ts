"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import type { PriceBookItem } from "./types";

/** Load the company price book once. Techs see item names/SKUs only — the API
 *  strips pricing for the TECHNICIAN role. */
export function usePriceBook() {
    const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);

    useEffect(() => {
        api.get("/price-book").then((res) => setPriceBookItems(res.data?.data?.items ?? [])).catch(() => {});
    }, []);

    return priceBookItems;
}
