"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Filter, TrendingUp } from "lucide-react";

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
type Stage = typeof STAGES[number];

interface Lead {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    leadStage: Stage;
    leadValue: number | null;
    leadSource: { id: string; name: string } | null;
    updatedAt: string;
}

export default function LeadsPage() {
    const qc = useQueryClient();
    const { data: pipeline } = useQuery({
        queryKey: ["leads-pipeline"],
        queryFn: () => api.get("/leads/pipeline").then((r) => r.data.data),
    });
    const { data: funnel } = useQuery({
        queryKey: ["leads-funnel"],
        queryFn: () => api.get("/leads/funnel?days=90").then((r) => r.data.data),
    });
    const move = useMutation({
        mutationFn: (vars: { id: string; stage: Stage }) =>
            api.patch(`/leads/${vars.id}/stage`, { stage: vars.stage }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["leads-pipeline"] }),
    });

    const byStage: Record<Stage, Lead[]> = pipeline?.byStage ?? {
        NEW: [], CONTACTED: [], QUALIFIED: [], PROPOSAL: [], WON: [], LOST: [],
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title flex items-center gap-2"><Filter className="h-6 w-6" /> Leads pipeline</h1>
                <p className="page-subtitle">Drag leads through stages. Marketing ROI below.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 overflow-x-auto">
                {STAGES.map((stage) => (
                    <div key={stage} className="surface-card p-2 min-w-[180px]">
                        <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide flex justify-between">
                            <span>{stage}</span>
                            <span>{byStage[stage].length}</span>
                        </div>
                        <div className="space-y-2 mt-2">
                            {byStage[stage].map((lead) => (
                                <div key={lead.id} className="rounded-lg border bg-white p-2.5 text-sm">
                                    <div className="font-medium">{lead.name}</div>
                                    {lead.phone && <div className="text-xs text-slate-500">{lead.phone}</div>}
                                    {lead.leadValue && (
                                        <div className="text-xs text-emerald-600 mt-0.5">R {Number(lead.leadValue).toFixed(0)}</div>
                                    )}
                                    {lead.leadSource && (
                                        <div className="text-[10px] uppercase mt-1 text-slate-400">{lead.leadSource.name}</div>
                                    )}
                                    <div className="flex gap-1 mt-2">
                                        {STAGES.filter((s) => s !== stage).slice(0, 3).map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => move.mutate({ id: lead.id, stage: s })}
                                                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
                                            >
                                                → {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {byStage[stage].length === 0 && (
                                <div className="text-xs text-slate-400 italic px-2 py-4 text-center">empty</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="surface-card p-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                    <TrendingUp className="h-5 w-5" /> Marketing ROI (last 90 days)
                </h2>
                {!funnel && <div className="text-sm text-slate-500">Loading…</div>}
                {funnel && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="py-2">Source</th>
                                    <th>Leads</th>
                                    <th>Won</th>
                                    <th>Revenue</th>
                                    <th>Spend</th>
                                    <th>ROI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {funnel.sources.map((s: any) => (
                                    <tr key={s.sourceId} className="border-t">
                                        <td className="py-2">{s.source}</td>
                                        <td>{s.leads}</td>
                                        <td>{s.won}</td>
                                        <td>R {s.revenue.toFixed(0)}</td>
                                        <td>R {(s.costPerMonth * 3).toFixed(0)}</td>
                                        <td className={s.roi >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                            {(s.roi * 100).toFixed(0)}%
                                        </td>
                                    </tr>
                                ))}
                                {funnel.sources.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-4 text-slate-400 italic">No lead sources configured yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
