"use client";

import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Crown, AlertTriangle } from "lucide-react";

export default function KpiPage() {
    const { data, isLoading } = useQuery({
        queryKey: ["kpi-snapshot"],
        queryFn: () => api.get("/analytics/kpi?days=30").then((r) => r.data.data.snapshot),
        refetchInterval: 60_000,
    });

    const fmtMoney = (n: number) => `R ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title flex items-center gap-2"><TrendingUp className="h-6 w-6" /> KPI Dashboard</h1>
                <p className="page-subtitle">Owner-view scorecard for the last 30 days.</p>
            </div>
            {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
            {data && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={fmtMoney(data.revenue)} delta={data.revenueChange} />
                        <Card icon={<Briefcase className="h-5 w-5" />} label="Avg ticket" value={fmtMoney(data.avgTicket)} />
                        <Card icon={<TrendingUp className="h-5 w-5" />} label="Close rate" value={fmtPct(data.closeRate)} />
                        <Card icon={<Users className="h-5 w-5" />} label="Jobs done" value={String(data.jobsCompleted)} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="surface-card p-4">
                            <h2 className="font-semibold flex items-center gap-2 mb-3">
                                <AlertTriangle className="h-4 w-4 text-rose-500" /> Accounts receivable
                            </h2>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Row label="Total open" value={fmtMoney(data.ar.open)} />
                                <Row label="Over 30 days" value={fmtMoney(data.ar.over30)} />
                                <Row label="Over 60 days" value={fmtMoney(data.ar.over60)} />
                                <Row label="Over 90 days" value={fmtMoney(data.ar.over90)} bad />
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
                    </div>
                </>
            )}
        </div>
    );
}

function Card({ icon, label, value, delta }: { icon: any; label: string; value: string; delta?: number }) {
    return (
        <div className="surface-card p-4">
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
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
    return (
        <div>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-lg font-semibold ${bad ? "text-rose-600" : ""}`}>{value}</div>
        </div>
    );
}
