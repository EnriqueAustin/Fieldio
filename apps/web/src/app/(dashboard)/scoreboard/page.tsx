"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Award, Briefcase, DollarSign, Activity, Clock } from "lucide-react";
import { DateRangePicker, rangeToQuery, type RangeValue } from "../../../components/dashboard/date-range-picker";
import { MiniBar } from "../../../components/dashboard/charts/mini-bar-chart";

interface ScoreRow {
    tech: { id: string; name: string };
    jobsCompleted: number;
    revenue: number;
    utilizationRate: number;
    avgDurationHours: number;
    firstTimeFixRate: number;
}

const fmtMoney = (n: number) => `R ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function ScoreboardPage() {
    const [range, setRange] = useState<RangeValue>({ days: 30 });
    const query = rangeToQuery(range);

    const { data, isLoading } = useQuery({
        queryKey: ["tech-scoreboard", query],
        queryFn: () => api.get(`/analytics/scoreboard?${query}`).then((r) => r.data.data.report),
    });

    const rows: ScoreRow[] = data?.scoreboard ?? [];
    const maxJobs = Math.max(1, ...rows.map((r) => r.jobsCompleted));
    const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title flex items-center gap-2"><Award className="h-6 w-6" /> Tech Scoreboard</h1>
                    <p className="page-subtitle">Per-technician performance for the selected range.</p>
                </div>
                <DateRangePicker value={range} onChange={setRange} />
            </div>

            {data?.totals && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Summary icon={<Briefcase className="h-5 w-5" />} label="Jobs completed" value={String(data.totals.jobsCompleted)} />
                    <Summary icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={fmtMoney(data.totals.revenue)} />
                    <Summary icon={<Activity className="h-5 w-5" />} label="Active techs" value={String(data.totals.technicians)} />
                </div>
            )}

            {isLoading ? (
                <div className="surface-card h-64 animate-pulse" />
            ) : (
                <div className="surface-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-slate-500 text-left">
                            <tr className="border-b border-border/60">
                                <th className="px-4 py-3">Technician</th>
                                <th className="px-4 py-3">Jobs done</th>
                                <th className="px-4 py-3">Revenue</th>
                                <th className="px-4 py-3">Utilization</th>
                                <th className="px-4 py-3"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Avg duration</span></th>
                                <th className="px-4 py-3">First-time fix</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.tech.id} className="border-b border-border/40 hover:bg-slate-50/60">
                                    <td className="px-4 py-3 font-medium">{r.tech.name}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 tabular-nums">{r.jobsCompleted}</span>
                                            <MiniBar value={r.jobsCompleted} max={maxJobs} color="#2563eb" label={`${r.jobsCompleted} jobs`} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-20 tabular-nums">{fmtMoney(r.revenue)}</span>
                                            <MiniBar value={r.revenue} max={maxRevenue} color="#059669" label={fmtMoney(r.revenue)} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 tabular-nums">{r.utilizationRate}%</span>
                                            <MiniBar value={r.utilizationRate} max={100} color="#d97706" label={`${r.utilizationRate}% utilization`} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 tabular-nums">{r.avgDurationHours ? `${r.avgDurationHours}h` : "—"}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 tabular-nums">{r.jobsCompleted ? `${r.firstTimeFixRate}%` : "—"}</span>
                                            {r.jobsCompleted > 0 && (
                                                <MiniBar value={r.firstTimeFixRate} max={100} color="#7c3aed" label={`${r.firstTimeFixRate}% first-time fix`} />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-10 text-center italic text-slate-400">No technicians or completed jobs in this period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-muted-foreground">
                First-time-fix is derived from completed jobs without a linked warranty claim. Utilization compares worked hours
                against available working hours ({data?.availableHours ?? 0}h) in the selected range.
            </p>
        </div>
    );
}

function Summary({ icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="surface-card p-4">
            <div className="flex justify-between items-start">
                <div className="text-xs uppercase text-slate-500 tracking-wide">{label}</div>
                <div className="text-slate-400">{icon}</div>
            </div>
            <div className="text-2xl font-bold mt-2">{value}</div>
        </div>
    );
}
