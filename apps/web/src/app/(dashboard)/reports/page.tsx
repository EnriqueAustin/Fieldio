"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { BarChart3, Clock, DollarSign, TrendingUp, Users } from "lucide-react";

type Tab = "costing" | "timesheet" | "earnings";

interface JobCostRow {
    jobId: string;
    title: string;
    customer: string;
    tech: string | null;
    durationHours: number;
    costs: { labor: number; material: number; service: number; expenses: number; purchaseOrders: number; total: number };
    invoiceTotal: number;
    profit: number;
    margin: number;
}

interface TimesheetTech {
    tech: { id: string; name: string };
    entries: Array<{ jobId: string; title: string; customer: string; date: string; hours: number }>;
    totalHours: number;
}

interface EarningsTech {
    tech: { id: string; name: string };
    jobCount: number;
    totalRevenue: number;
    totalLaborValue: number;
}

export default function ReportsPage() {
    const [tab, setTab] = useState<Tab>("costing");
    const [costingData, setCostingData] = useState<{ summary: any; jobs: JobCostRow[] } | null>(null);
    const [timesheetData, setTimesheetData] = useState<{ technicians: TimesheetTech[]; totalHours: number } | null>(null);
    const [earningsData, setEarningsData] = useState<{ technicians: EarningsTech[]; totals: any } | null>(null);

    useEffect(() => {
        if (tab === "costing" && !costingData) {
            api.get("/analytics/job-costing").then(r => setCostingData(r.data.data.report)).catch(console.error);
        }
        if (tab === "timesheet" && !timesheetData) {
            api.get("/analytics/timesheet").then(r => setTimesheetData(r.data.data.report)).catch(console.error);
        }
        if (tab === "earnings" && !earningsData) {
            api.get("/analytics/tech-earnings").then(r => setEarningsData(r.data.data.report)).catch(console.error);
        }
    }, [tab]);

    const fmt = (n: number) => `R ${n.toFixed(2)}`;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Reports</h1>
                <p className="page-subtitle">Job costing, timesheets, and technician earnings.</p>
            </div>

            <div className="flex gap-1 border-b border-border">
                {([
                    { key: "costing" as Tab, label: "Job Costing", icon: BarChart3 },
                    { key: "timesheet" as Tab, label: "Timesheet", icon: Clock },
                    { key: "earnings" as Tab, label: "Tech Earnings", icon: Users },
                ]).map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-muted-foreground hover:text-slate-700"}`}>
                        <t.icon className="h-4 w-4" />{t.label}
                    </button>
                ))}
            </div>

            {tab === "costing" && costingData && (
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="surface-card p-5">
                            <div className="flex items-center gap-3"><DollarSign className="h-5 w-5 text-emerald-600" /><div>
                                <p className="text-2xl font-semibold">{fmt(costingData.summary.totalRevenue)}</p>
                                <p className="text-xs text-muted-foreground">Total revenue</p>
                            </div></div>
                        </div>
                        <div className="surface-card p-5">
                            <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-blue-600" /><div>
                                <p className="text-2xl font-semibold">{fmt(costingData.summary.totalCosts)}</p>
                                <p className="text-xs text-muted-foreground">Total costs</p>
                            </div></div>
                        </div>
                        <div className="surface-card p-5">
                            <div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-emerald-600" /><div>
                                <p className="text-2xl font-semibold">{fmt(costingData.summary.totalProfit)}</p>
                                <p className="text-xs text-muted-foreground">Total profit</p>
                            </div></div>
                        </div>
                        <div className="surface-card p-5">
                            <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-amber-600" /><div>
                                <p className="text-2xl font-semibold">{costingData.summary.avgMargin}%</p>
                                <p className="text-xs text-muted-foreground">Avg margin</p>
                            </div></div>
                        </div>
                    </div>
                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead><tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Job</th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tech</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Costs</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Profit</th>
                                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/60">
                                {costingData.jobs.map(j => (
                                    <tr key={j.jobId} className="hover:bg-slate-50/70">
                                        <td className="px-4 py-3 text-sm font-medium">{j.title}</td>
                                        <td className="px-4 py-3 text-sm">{j.customer}</td>
                                        <td className="px-4 py-3 text-sm">{j.tech || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums">{j.durationHours}h</td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums">{fmt(j.costs.total)}</td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums">{fmt(j.invoiceTotal)}</td>
                                        <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${j.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(j.profit)}</td>
                                        <td className={`px-4 py-3 text-sm text-right tabular-nums ${j.margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{j.margin}%</td>
                                    </tr>
                                ))}
                                {costingData.jobs.length === 0 && (
                                    <tr><td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No completed jobs in this period</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "timesheet" && timesheetData && (
                <div className="space-y-4">
                    <div className="surface-card p-5">
                        <p className="text-sm text-muted-foreground">Total hours this period</p>
                        <p className="text-3xl font-semibold">{timesheetData.totalHours}h</p>
                    </div>
                    {timesheetData.technicians.map(t => (
                        <div key={t.tech.id} className="surface-card overflow-hidden">
                            <div className="px-6 py-4 border-b border-border/60 bg-slate-50/50 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{t.tech.name}</p>
                                    <p className="text-xs text-muted-foreground">{t.entries.length} entries</p>
                                </div>
                                <p className="text-lg font-semibold">{t.totalHours}h</p>
                            </div>
                            <table className="w-full">
                                <thead><tr className="border-b border-border/40">
                                    <th className="px-6 py-2 text-left text-[11px] font-semibold uppercase text-muted-foreground">Date</th>
                                    <th className="px-6 py-2 text-left text-[11px] font-semibold uppercase text-muted-foreground">Job</th>
                                    <th className="px-6 py-2 text-left text-[11px] font-semibold uppercase text-muted-foreground">Customer</th>
                                    <th className="px-6 py-2 text-right text-[11px] font-semibold uppercase text-muted-foreground">Hours</th>
                                </tr></thead>
                                <tbody className="divide-y divide-border/40">
                                    {t.entries.map((e, i) => (
                                        <tr key={i} className="hover:bg-slate-50/70">
                                            <td className="px-6 py-2 text-sm">{e.date}</td>
                                            <td className="px-6 py-2 text-sm">{e.title}</td>
                                            <td className="px-6 py-2 text-sm">{e.customer}</td>
                                            <td className="px-6 py-2 text-sm text-right tabular-nums">{e.hours}h</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                    {timesheetData.technicians.length === 0 && (
                        <div className="surface-card p-12 text-center text-sm text-muted-foreground">No timesheet data for this period</div>
                    )}
                </div>
            )}

            {tab === "earnings" && earningsData && (
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Total jobs</p><p className="text-2xl font-semibold">{earningsData.totals.jobs}</p></div>
                        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Total revenue</p><p className="text-2xl font-semibold">{fmt(earningsData.totals.revenue)}</p></div>
                        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Total labor value</p><p className="text-2xl font-semibold">{fmt(earningsData.totals.laborValue)}</p></div>
                    </div>
                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead><tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase text-muted-foreground">Technician</th>
                                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">Jobs</th>
                                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">Revenue</th>
                                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">Labor value</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/60">
                                {earningsData.technicians.map(t => (
                                    <tr key={t.tech.id} className="hover:bg-slate-50/70">
                                        <td className="px-6 py-3.5 text-sm font-medium">{t.tech.name}</td>
                                        <td className="px-6 py-3.5 text-sm text-right tabular-nums">{t.jobCount}</td>
                                        <td className="px-6 py-3.5 text-sm text-right tabular-nums">{fmt(t.totalRevenue)}</td>
                                        <td className="px-6 py-3.5 text-sm text-right tabular-nums font-medium">{fmt(t.totalLaborValue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
