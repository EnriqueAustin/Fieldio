import { useAuthStore } from "../store/auth";

/**
 * Mirrors the `restrictTo(...)` guards on the API so the UI never offers a
 * button that is going to come back 403. Keep this in sync with
 * `apps/api/src/routes/*` — a capability here should name the same role list as
 * the route it guards.
 */
export const CAPABILITIES = {
    /** Create/edit/delete subcontractors and see payout totals. */
    manageSubcontractors: ["ADMIN", "OFFICE"],
    /** Assign a subcontractor to a job. */
    assignSubcontractors: ["ADMIN", "OFFICE", "DISPATCHER"],
    /** Create/edit/delete marketing campaigns (they carry spend). */
    manageCampaigns: ["ADMIN", "OFFICE"],
    /** Create or edit the financing products offered to customers. */
    manageFinancingOptions: ["ADMIN"],
    /** Work customer financing applications. */
    manageFinancingApplications: ["ADMIN", "OFFICE", "SALES"],
    /** Company revenue, KPI and analytics reporting. */
    viewRevenueAnalytics: ["ADMIN", "OFFICE", "ACCOUNTANT"],
    /** Per-technician performance scoreboard. */
    viewTechScoreboard: ["ADMIN", "ACCOUNTANT"],
    /** Create and edit customers. */
    manageCustomers: ["ADMIN", "OFFICE", "DISPATCHER"],
    /** Issue invoices, credit notes and record payments. */
    manageBilling: ["ADMIN", "OFFICE", "ACCOUNTANT"],
} as const;

export type Capability = keyof typeof CAPABILITIES;

export function roleCan(role: string | null | undefined, capability: Capability): boolean {
    if (!role) return false;
    return (CAPABILITIES[capability] as readonly string[]).includes(role);
}

/** Hook form of {@link roleCan} for use inside components. */
export function useCan(capability: Capability): boolean {
    const role = useAuthStore((s) => s.user?.role);
    return roleCan(role, capability);
}
