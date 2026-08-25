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
import { DispatchView } from "../../components/dashboard/dispatch-view";
import { SalesView } from "../../components/dashboard/sales-view";
import { useAuthStore } from "../../store/auth";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { cn, displayName, firstNameOf } from "../../lib/utils";
import { LineAreaChart, type LineAreaPoint } from "../../components/dashboard/charts/line-area-chart";
import { StackedBarChart } from "../../components/dashboard/charts/stacked-bar-chart";
import { FunnelChart } from "../../components/dashboard/charts/funnel-chart";
import { EmptyState, SkeletonShell, StatCard, StatusPill, formatMoney } from "../../components/dashboard/shared";

const JOB_STATUS_SERIES = [
    { key: "COMPLETED", label: "Completed", color: "#059669" },
    { key: "ON_SITE", label: "On site", color: "#d97706" },
    { key: "EN_ROUTE", label: "En route", color: "#7c3aed" },
    { key: "ASSIGNED", label: "Assigned", color: "#2563eb" },
    { key: "REQUESTED", label: "Requested", color: "#94a3b8" },
    { key: "CANCELED", label: "Canceled", color: "#e11d48" },
];

function weekLabel(iso: string) {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

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

export default function DashboardPage() {
    const { user } = useAuthStore();
    // Revenue analytics are restricted to ADMIN/OFFICE/ACCOUNTANT server-side, so
    // the other roles get a home built from data they are allowed to read.
    const usesRevenueDashboard =
        !!user && ["ADMIN", "OFFICE", "ACCOUNTANT"].includes(user.role);

    const { data: stats, error } = useQuery<DashboardStats>({
        queryKey: ["dashboard-stats"],
        queryFn: () => api.get("/analytics/dashboard").then((res) => {
            if (!res.data?.data?.stats) throw new Error("Invalid data format received from server");
            return res.data.data.stats;
        }),
        enabled: usesRevenueDashboard,
    });

    const { data: series } = useQuery({
        queryKey: ["dashboard-timeseries"],
        queryFn: () => api.get("/analytics/timeseries?days=90").then((res) => res.data.data.report),
        enabled: usesRevenueDashboard,
    });

    if (!user) return <SkeletonShell />;
    if (user.role === "TECHNICIAN") return <TechnicianView user={user} stats={stats ?? null} />;
    if (user.role === "SALES") return <SalesView user={user} />;
    if (!usesRevenueDashboard) return <DispatchView user={user} />;
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
                    <h1 className="page-title">Welcome back, {firstNameOf(user)}</h1>
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
                <Link href="/invoices/overdue">
                    <StatCard
                        label="Revenue In Range"
                        value={formatMoney(stats.revenue.total)}
                        sub={`${formatMoney(stats.revenue.outstanding)} outstanding`}
                        icon={DollarSign}
                        accent="bg-emerald-50 text-emerald-600"
                        delta={{
                            value: `${stats.invoices.overdue} overdue`,
                            positive: stats.invoices.overdue === 0,
                        }}
                    />
                </Link>
                <Link href="/jobs">
                    <StatCard
                        label="Active Jobs"
                        value={String(stats.jobs.active)}
                        sub={`${stats.jobs.completed} completed | ${completionRate}% rate`}
                        icon={Briefcase}
                        accent="bg-blue-50 text-blue-600"
                    />
                </Link>
                <Link href="/customers">
                    <StatCard
                        label="Customers"
                        value={String(stats.customers.total)}
                        sub="Lifetime clients"
                        icon={Users}
                        accent="bg-violet-50 text-violet-600"
                        delta={{
                            value: `${stats.estimates.conversionRate}% quote close`,
                            positive: stats.estimates.conversionRate >= 50,
                        }}
                    />
                </Link>
                <Link href="/kpi">
                    <StatCard
                        label="Technician Utilization"
                        value={`${stats.technicians.utilizationRate}%`}
                        sub={`${stats.technicians.active} active right now`}
                        icon={Activity}
                        accent="bg-amber-50 text-amber-600"
                    />
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="surface-card p-5 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Revenue Trend</h3>
                        <Link href="/kpi" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                            KPI dashboard <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Weekly invoiced revenue, last 90 days</p>
                    <LineAreaChart
                        data={(series?.weeks ?? []).map((w: any): LineAreaPoint => ({ label: weekLabel(w.weekStart), value: w.revenue }))}
                        formatValue={(n) => `R ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        title="Revenue by week"
                    />
                </div>
                <div className="surface-card p-5">
                    <h3 className="font-semibold">Quote Funnel</h3>
                    <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Sent → approved → converted</p>
                    {series?.funnel ? (
                        <FunnelChart
                            formatValue={(n) => `R ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                            stages={[
                                { label: "Sent", count: series.funnel.sent.count, value: series.funnel.sent.value, color: "#2563eb", href: "/estimates?status=SENT" },
                                { label: "Approved", count: series.funnel.approved.count, value: series.funnel.approved.value, color: "#7c3aed", href: "/estimates?status=APPROVED" },
                                { label: "Converted", count: series.funnel.converted.count, value: series.funnel.converted.value, color: "#059669", href: "/jobs" },
                            ]}
                        />
                    ) : (
                        <div className="text-xs text-slate-400">No quote data yet.</div>
                    )}
                </div>
            </div>

            <div className="surface-card p-5">
                <h3 className="font-semibold">Jobs by Status Over Time</h3>
                <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Weekly job volume by status, last 90 days</p>
                <StackedBarChart
                    data={(series?.weeks ?? []).map((w: any) => ({ label: weekLabel(w.weekStart), values: w.jobsByStatus }))}
                    series={JOB_STATUS_SERIES}
                    title="Jobs by status per week"
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
                                                {displayName(t.tech)}
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
