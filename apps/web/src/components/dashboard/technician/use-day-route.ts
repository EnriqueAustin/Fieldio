"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "../../../lib/api";
import type { DayRoute } from "./types";

/**
 * Today's suggested visiting order for the signed-in technician. Keyed by the
 * local date so the persisted React Query cache serves the last-known route when
 * the tech is offline, and a new day never shows yesterday's stops.
 */
export function useDayRoute() {
    const date = format(new Date(), "yyyy-MM-dd");
    // Minutes east of UTC, so the API cuts the day on the tech's local midnight.
    const tzOffset = -new Date().getTimezoneOffset();
    return useQuery<DayRoute | null>({
        queryKey: ["technician-day-route", date],
        queryFn: async () => {
            const res = await api.get("/schedule/my-route", { params: { date, tzOffset } });
            return (res.data?.data?.route ?? null) as DayRoute | null;
        },
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
    });
}
