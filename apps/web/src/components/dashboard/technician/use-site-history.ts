"use client";

import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";

export interface SiteHistoryWarrantyClaim {
    id: string;
    claimNumber?: string | null;
    status: string;
    issueDescription: string;
    submittedDate: string;
    resolvedDate?: string | null;
}

// Prior-visit summary for the customer/property. Pricing is never part of this
// payload — the API strips it for the TECHNICIAN role.
export interface SiteHistoryVisit {
    id: string;
    date: string;
    title: string;
    description?: string | null;
    status: string;
    technicianName?: string | null;
    isSameProperty: boolean;
    noteExcerpt?: string | null;
    noteCount: number;
    photoCount: number;
    warrantyClaims: SiteHistoryWarrantyClaim[];
}

/**
 * Lazy-loaded customer/site history for the field console. The query only fires
 * once `enabled` (the card is expanded) so we don't fetch history for every job
 * the tech scrolls past. The query key is stable per job, so the persisted React
 * Query cache serves the last-known history when the tech is offline.
 */
export function useSiteHistory(jobId: string | undefined, enabled: boolean) {
    return useQuery<SiteHistoryVisit[]>({
        queryKey: ["technician-site-history", jobId],
        queryFn: async () => {
            const res = await api.get(`/jobs/${jobId}/site-history`);
            return (res.data?.data?.history ?? []) as SiteHistoryVisit[];
        },
        enabled: enabled && !!jobId,
        staleTime: 5 * 60_000,
    });
}
