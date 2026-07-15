"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "../../../lib/api";
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Crown, AlertTriangle } from "lucide-react";
import { DateRangePicker, rangeToQuery, type RangeValue } from "../../../components/dashboard/date-range-picker";
import { LineAreaChart, type LineAreaPoint } from "../../../components/dashboard/charts/line-area-chart";
import { StackedBarChart } from "../../../components/dashboard/charts/stacked-bar-chart";
import { FunnelChart } from "../../../components/dashboard/charts/funnel-chart";

const JOB_STATUS_SERIES = [
    { key: "COMPLETED", label: "Completed", color: "#059669" },
    { key: "ON_SITE", label: "On site", color: "#d97706" },
    { key: "EN_ROUTE", label: "En route", color: "#7c3aed" },
    { key: "ASSIGNED", label: "Assigned", color: "#2563eb" },
    { key: "REQUESTED", label: "Requested", color: "#94a3b8" },
    { key: "CANCELED", label: "Canceled", color: "#e11d48" },
];

export default function KpiPage() {
    const [range, setRange] = useState<RangeValue>({ days: 30 });
    const query = rangeToQuery(range);

    const { data, isLoading } = useQuery({
        queryKey: ["kpi-snapshot", query],
        queryFn: () => api.get(`/analytics/kpi?${query}`).then((r) => r.data.data.snapshot),
        refetchInterval: 60_000,
    });

    const { data: series } = useQuery({
        queryKey: ["kpi-timeseries", query],
        queryFn: () => api.get(`/analytics/timeseries?${query}`).then((r) => r.data.data.report),
    });

    const fmtMoney = (n: number) => `R ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

    const revenuePoints: LineAreaPoint[] = useMemo(
        () => (series?.weeks ?? []).map((w: any) => ({ label: weekLabel(w.weekStart), value: w.revenue })),
        [series]
    );
    const jobsData = useMemo(
        () =>
            (series?.weeks ?? []).map((w: any) => ({ label: weekLabel(w.weekStart), values: w.jobsByStatus })),
        [series]
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title flex items-center gap-2"><TrendingUp className="h-6 w-6" /> KPI Dashboard</h1>
                    <p className="page-subtitle">Owner-view scorecard with trends and vs-previous-period comparison.</p>
                </div>
                <DateRangePicker value={range} onChange={setRange} />
            </div>
            {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
            {data && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={fmtMoney(data.revenue)} delta={data.revenueChange} href="/invoices" />
                        <Card icon={<Briefcase className="h-5 w-5" />} label="Avg ticket" value={fmtMoney(data.avgTicket)} delta={data.avgTicketChange} />
                        <Card icon={<TrendingUp className="h-5 w-5" />} label="Close rate" value={fmtPct(data.closeRate)} delta={data.closeRateChange} href="/estimates" />
                        <Card icon={<Users className="h-5 w-5" />} label="Jobs done" value={String(data.jobsCompleted)} delta={data.jobsCompletedChange} href="/jobs" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="surface-card p-4">
                            <h2 className="font-semibold mb-3">Revenue trend</h2>
                            <LineAreaChart data={revenuePoints} formatValue={(n) => fmtMoney(n)} title="Revenue by week" />
                        </div>
                        <div className="surface-card p-4">
                            <h2 className="font-semibold mb-3">Jobs by status over time</h2>
                            <StackedBarChart data={jobsData} series={JOB_STATUS_SERIES} title="Jobs by status per week" />
                        </div>
                    </div>

                    <div className="surface-card p-4">
                        <h2 className="font-semibold mb-3">Quote funnel</h2>
                        {series?.funnel ? (
                            <FunnelChart
                                formatValue={fmtMoney}
                                stages={[
                                    { label: "Sent", count: series.funnel.sent.count, value: series.funnel.sent.value, color: "#2563eb", href: "/estimates?status=SENT" },
                                    { label: "Approved", count: series.funnel.approved.count, value: series.funnel.approved.value, color: "#7c3aed", href: "/estimates?status=APPROVED" },
                                    { label: "Converted to job", count: series.funnel.converted.count, value: series.funnel.converted.value, color: "#059669", href: "/jobs" },
                                ]}
                            />
                        ) : (
                            <div className="text-xs text-slate-400">No quote data for this period.</div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="surface-card p-4">
                            <h2 className="font-semibold flex items-center gap-2 mb-3">
                                <AlertTriangle className="h-4 w-4 text-rose-500" /> Accounts receivable
                            </h2>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Row label="Total open" value={fmtMoney(data.ar.open)} href="/invoices/overdue" />
                                <Row label="Over 30 days" value={fmtMoney(data.ar.over30)} href="/invoices/overdue" />
                                <Row label="Over 60 days" value={fmtMoney(data.ar.over60)} href="/invoices/overdue" />
                                <Row label="Over 90 days" value={fmtMoney(data.ar.over90)} bad href="/invoices/overdue" />
                            </div>
                        </div>

                        <div className="surface-card p-4">
                            <h2 className="font-semibold flex items-center gap-2 mb-3">
                                <Crown className="h-4 w-4 text-amber-500" /> Memberships
                            </h2>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Row label="Active" value={String(data.members.active)} />
                                <Row label="Churned (period)" value={String(data.members.churned)} bad={data.members.churned > 0} />
                            </div>
                        </div>
                    </div>

                    <div className="surface-card p-4">
                        <h2 className="font-semibold mb-3">Top techs by revenue</h2>
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-slate-500 text-left">
                                <tr><th className="py-1">Tech</th><th>Jobs</th><th>Revenue</th></tr>
                            </thead>
                            <tbody>
                                {data.topTechs.map((t: any) => (
                                    <tr key={t.techId} className="border-t">
                                        <td className="py-2">{t.name}</td>
                                        <td>{t.jobs}</td>
                                        <td>{fmtMoney(t.revenue)}</td>
                                    </tr>
                                ))}
                                {data.topTechs.length === 0 && (
                                    <tr><td colSpan={3} className="py-4 italic text-slate-400 text-center">No completed jobs in period.</td></tr>
                                )}
                            </tbody>
                        </table>
                        <div className="mt-3 text-right">
                            <Link href="/scoreboard" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                                Open full technician scoreboard →
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function weekLabel(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

function Card({ icon, label, value, delta, href }: { icon: any; label: string; value: string; delta?: number; href?: string }) {
    const inner = (
        <div className="surface-card p-4 h-full hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
                <div className="text-xs uppercase text-slate-500 tracking-wide">{label}</div>
                <div className="text-slate-400">{icon}</div>
            </div>
            <div className="text-2xl font-bold mt-2">{value}</div>
            {delta !== undefined && delta !== 0 && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {(delta * 100).toFixed(0)}% vs prev
                </div>
            )}
        </div>
    );
    return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function Row({ label, value, bad, href }: { label: string; value: string; bad?: boolean; href?: string }) {
    const inner = (
        <div>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-lg font-semibold ${bad ? "text-rose-600" : ""}`}>{value}</div>
        </div>
    );
    return href ? <Link href={href} className="block hover:opacity-80 transition">{inner}</Link> : inner;
}
