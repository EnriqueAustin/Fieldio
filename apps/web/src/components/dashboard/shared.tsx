"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";

export const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-50 text-slate-700 ring-slate-200",
    ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
    EN_ROUTE: "bg-violet-50 text-violet-700 ring-violet-200",
    ON_SITE: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    CANCELED: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const STATUS_DOT: Record<string, string> = {
    REQUESTED: "bg-slate-400",
    ASSIGNED: "bg-blue-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    COMPLETED: "bg-emerald-500",
    CANCELED: "bg-rose-500",
};

export const formatMoney = (amount: number) =>
    new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 2,
    }).format(Number(amount || 0));

export function StatusPill({ status }: { status: string }) {
    return (
        <span className={cn("status-pill", STATUS_STYLES[status] ?? STATUS_STYLES.REQUESTED)}>
            <span className={cn("status-pill-dot", STATUS_DOT[status] ?? "bg-slate-400")} />
            {status.replace(/_/g, " ")}
        </span>
    );
}

export function StatCard({
    label,
    value,
    sub,
    icon: Icon,
    accent,
    delta,
}: {
    label: string;
    value: string;
    sub?: string;
    icon: any;
    accent: string;
    delta?: { value: string; positive?: boolean };
}) {
    return (
        <div className="surface-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
                <div className={cn("icon-tile", accent)}>
                    <Icon className="h-5 w-5" />
                </div>
                {delta && (
                    <span
                        className={cn(
                            "stat-chip",
                            delta.positive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                        )}
                    >
                        <TrendingUp className="h-3 w-3" />
                        {delta.value}
                    </span>
                )}
            </div>
            <div className="mt-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </div>
        </div>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    hint,
}: {
    icon: any;
    title: string;
    hint: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}

export function SkeletonShell() {
    return (
        <div className="space-y-8">
            <div className="h-10 w-72 animate-pulse rounded-lg bg-slate-200/70" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="surface-card h-32 animate-pulse p-5" />
                ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-7">
                <div className="surface-card h-72 animate-pulse lg:col-span-4" />
                <div className="surface-card h-72 animate-pulse lg:col-span-3" />
            </div>
        </div>
    );
}
