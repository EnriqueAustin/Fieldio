"use client";

import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { normalizeCompanySettings, type CompanySettings } from "../../../lib/company-settings";

/**
 * Field console company settings. Fetched the same way the settings page reads
 * them (GET /company/me) and normalized through the shared helper. The result is
 * cached by React Query (whose cache is persisted for offline-first), so when the
 * tech has no signal the last-known value is used instead of flipping features off.
 * Only the flags the field UI needs are surfaced here — never pricing.
 */
export function useCompanySettings() {
    const query = useQuery<CompanySettings>({
        queryKey: ["company-settings"],
        queryFn: async () => {
            const res = await api.get("/company/me");
            return normalizeCompanySettings(res.data?.data?.company?.settings);
        },
        staleTime: 5 * 60_000,
    });

    // Default OFF until we know otherwise. Offline with a cached value, React Query
    // hands back the persisted last-known settings so the flag stays truthful.
    const fieldQuotingEnabled = query.data?.fieldQuoting?.enabled ?? false;

    return { settings: query.data, fieldQuotingEnabled, isLoading: query.isLoading };
}
