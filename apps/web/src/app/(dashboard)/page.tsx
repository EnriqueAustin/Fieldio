"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "../../lib/api";
import {
    Activity,
    DollarSign,
    Users,
    Briefcase,
    ArrowUpRight,
    TrendingUp,
    Clock,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { TechnicianView } from "../../components/dashboard/technician-view";
import { useAuthStore } from "../../store/auth";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { cn } from "../../lib/utils";

interface DashboardStats {
    range: { from: string; to: string };
    revenue: { total: number; outstanding: number };
    jobs: { total: number; completed: number; active: number };
    customers: { total: number };
    estimates: { sent: number; approved: number; conversionRate: number };
    technicians: { total: number; active: number; utilizationRate: number };
    invoices: { overdue: number };
    recentJobs: any[];
    activeTechs: any[];
}

const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-50 text-slate-700 ring-slate-200",
    ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
    EN_ROUTE: "bg-violet-50 text-violet-700 ring-violet-200",
    ON_SITE: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    CANCELED: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STATUS_DOT: Record<string, string> = {
    REQUESTED: "bg-slate-400",
    ASSIGNED: "bg-blue-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    COMPLETED: "bg-emerald-500",
    CANCELED: "bg-rose-500",
};

const formatMoney = (amount: number) =>
    new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 2,
    }).format(Number(amount || 0));

function StatusPill({ status }: { status: string }) {
    return (
        <span className={cn("status-pill", STATUS_STYLES[status] ?? STATUS_STYLES.REQUESTED)}>
            <span className={cn("status-pill-dot", STATUS_DOT[status] ?? "bg-slate-400")} />
            {status.replace(/_/g, " ")}
        </span>
    );
}

function StatCard({
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
        <div className="surface-card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
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

export default function DashboardPage() {
    const { user } = useAuthStore();

    const { data: stats, error } = useQuery<DashboardStats>({
        queryKey: ["dashboard-stats"],
        queryFn: () => api.get("/analytics/dashboard").then((res) => {
            if (!res.data?.data?.stats) throw new Error("Invalid data format received from server");
            return res.data.data.stats;
        }),
        enabled: !!user && user.role !== "TECHNICIAN",
    });

    if (!user) return <SkeletonShell />;
    if (user.role === "TECHNICIAN") return <TechnicianView user={user} stats={stats ?? null} />;
    if (error) {
        return (
            <div className="surface-card flex items-center gap-3 p-6 text-rose-700">
                <AlertCircle className="h-5 w-5" />
                <span>{(error as any).message ?? "Failed to load dashboard"}</span>
            </div>
        );
    }
    if (!stats) return <SkeletonShell />;

    const completionRate = stats.jobs.total
        ? Math.round((stats.jobs.completed / stats.jobs.total) * 100)
        : 0;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title">Welcome back, {user.email.split("@")[0]}</h1>
                    <p className="page-subtitle">
                        Here&apos;s what&apos;s happening with your business today.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/jobs"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                    >
                        View all jobs
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Link
                        href="/schedule"
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                        Open dispatch
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Revenue In Range"
                    value={formatMoney(stats.revenue.total)}
                    sub={`${formatMoney(stats.revenue.outstanding)} outstanding`}
                    icon={DollarSign}
                    accent="bg-emerald-50 text-emerald-600"
                    delta={{
                        value: `${stats.estimates.conversionRate}% close`,
                        positive: stats.estimates.conversionRate >= 50,
                    }}
                />
                <StatCard
                    label="Active Jobs"
                    value={String(stats.jobs.active)}
                    sub={`${stats.jobs.completed} completed | ${completionRate}% rate`}
                    icon={Briefcase}
                    accent="bg-blue-50 text-blue-600"
                />
                <Link href="/invoices/overdue">
                    <StatCard
                        label="Customers"
                        value={String(stats.customers.total)}
                        sub="Lifetime clients"
                        icon={Users}
                        accent="bg-violet-50 text-violet-600"
                        delta={{
                            value: `${stats.invoices.overdue} overdue`,
                            positive: stats.invoices.overdue === 0,
                        }}
                    />
                </Link>
                <StatCard
                    label="Technician Utilization"
                    value={`${stats.technicians.utilizationRate}%`}
                    sub={`${stats.technicians.active} active right now`}
                    icon={Activity}
                    accent="bg-amber-50 text-amber-600"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                <div className="surface-card overflow-hidden lg:col-span-4">
                    <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                        <div>
                            <h3 className="font-semibold">Recent Activity</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Latest jobs across your team
                            </p>
                        </div>
                        <Link
                            href="/jobs"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                            View all <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-border/60">
                        {stats.recentJobs.length === 0 ? (
                            <EmptyState
                                icon={Briefcase}
                                title="No recent activity"
                                hint="Jobs will appear here as they are created."
                            />
                        ) : (
                            stats.recentJobs.map((job: any) => (
                                <Link
                                    key={job.id}
                                    href={`/jobs/${job.id}`}
                                    className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-slate-50/70"
                                >
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-700">
                                            {job.tech?.email?.[0]?.toUpperCase() ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{job.title}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {job.customer?.name}
                                        </p>
                                    </div>
                                    <StatusPill status={job.status} />
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                <div className="surface-card overflow-hidden lg:col-span-3">
                    <div className="border-b border-border/60 px-6 py-4">
                        <h3 className="font-semibold">Technician Status</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Live updates from the field
                        </p>
                    </div>
                    <div className="p-3">
                        {stats.activeTechs.length === 0 ? (
                            <EmptyState
                                icon={CheckCircle2}
                                title="All clear"
                                hint="No technicians on active jobs right now."
                            />
                        ) : (
                            <div className="space-y-1">
                                {stats.activeTechs.map((t: any) => (
                                    <div
                                        key={t.id}
                                        className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-slate-50/70"
                                    >
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-slate-100 text-xs text-slate-700">
                                                {t.tech?.email?.[0]?.toUpperCase() ?? "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {t.tech?.email?.split("@")[0]}
                                            </p>
                                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                Job #{String(t.id).slice(0, 6)}
                                            </p>
                                        </div>
                                        <StatusPill status={t.status} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function EmptyState({
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

function SkeletonShell() {
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
