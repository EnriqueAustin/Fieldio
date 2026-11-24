"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Filter, TrendingUp, Plus, Settings2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { NewLeadDialog } from "../../../components/leads/new-lead-dialog";
import { ManageSourcesDialog } from "../../../components/leads/manage-sources-dialog";
import { LeadDetailDrawer } from "../../../components/leads/lead-detail-drawer";
import { ConvertLeadDialog } from "../../../components/leads/convert-lead-dialog";
import { STAGES, formatRand, type Stage, type Lead } from "../../../components/leads/types";

export default function LeadsPage() {
    const qc = useQueryClient();
    const [newOpen, setNewOpen] = useState(false);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [detail, setDetail] = useState<Lead | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
    const [convert, setConvert] = useState<{ lead: Lead; target: "QUOTE" | "JOB" } | null>(null);

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

    const drop = (stage: Stage) => {
        setDragOverStage(null);
        if (dragId) {
            const current = STAGES.find((s) => byStage[s].some((l) => l.id === dragId));
            if (current !== stage) move.mutate({ id: dragId, stage });
        }
        setDragId(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="page-title flex items-center gap-2"><Filter className="h-6 w-6" /> Leads pipeline</h1>
                    <p className="page-subtitle">Drag leads between stages, or open a card to edit and convert. Marketing ROI below.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSourcesOpen(true)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Manage sources
                    </Button>
                    <Button size="sm" onClick={() => setNewOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> New lead
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 overflow-x-auto">
                {STAGES.map((stage) => (
                    <div
                        key={stage}
                        onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
                        onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                        onDrop={() => drop(stage)}
                        className={`surface-card p-2 min-w-[180px] transition-colors ${dragOverStage === stage ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                    >
                        <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide flex justify-between">
                            <span>{stage}</span>
                            <span>{byStage[stage].length}</span>
                        </div>
                        <div className="space-y-2 mt-2 min-h-[40px]">
                            {byStage[stage].map((lead) => (
                                <div
                                    key={lead.id}
                                    draggable
                                    onDragStart={() => setDragId(lead.id)}
                                    onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                                    onClick={() => setDetail(lead)}
                                    className={`rounded-lg border bg-white p-2.5 text-sm cursor-pointer hover:border-primary/50 ${dragId === lead.id ? "opacity-50" : ""}`}
                                >
                                    <div className="font-medium">{lead.name}</div>
                                    {lead.phone && <div className="text-xs text-slate-500">{lead.phone}</div>}
                                    {lead.leadValue != null && (
                                        <div className="text-xs text-emerald-600 mt-0.5">{formatRand(lead.leadValue)}</div>
                                    )}
                                    {lead.leadSource && (
                                        <div className="text-[10px] uppercase mt-1 text-slate-400">{lead.leadSource.name}</div>
                                    )}
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
                                        <td>{formatRand(s.revenue)}</td>
                                        <td>{formatRand(s.costPerMonth * 3)}</td>
                                        <td className={s.roi >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                            {(s.roi * 100).toFixed(0)}%
                                        </td>
                                    </tr>
                                ))}
                                {funnel.sources.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-4 text-slate-400">
                                            No lead sources configured yet.{" "}
                                            <button className="text-primary hover:underline" onClick={() => setSourcesOpen(true)}>
                                                Add one
                                            </button>
                                            .
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onManageSources={() => { setNewOpen(false); setSourcesOpen(true); }} />
            <ManageSourcesDialog open={sourcesOpen} onOpenChange={setSourcesOpen} />
            <LeadDetailDrawer
                lead={detail}
                onClose={() => setDetail(null)}
                onConvert={(lead, target) => { setDetail(null); setConvert({ lead, target }); }}
            />
            <ConvertLeadDialog
                lead={convert?.lead ?? null}
                target={convert?.target ?? null}
                onOpenChange={(v) => { if (!v) setConvert(null); }}
            />
        </div>
    );
}
