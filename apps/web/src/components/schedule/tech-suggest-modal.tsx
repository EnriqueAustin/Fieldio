"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { X, Check, AlertTriangle } from "lucide-react";

interface Candidate {
    techId: string;
    name: string;
    avatarUrl: string | null;
    skills: string[];
    skillCoverage: number;
    conflicts: number;
    score: number;
}

export function TechSuggestModal({
    jobId,
    onClose,
}: {
    jobId: string | null;
    onClose: () => void;
}) {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["suggest-techs", jobId],
        queryFn: () =>
            api.get(`/schedule/jobs/${jobId}/suggest-techs`).then((r) => r.data.data as { requiredSkills: string[]; candidates: Candidate[] }),
        enabled: !!jobId,
    });

    const assign = useMutation({
        mutationFn: (techId: string) =>
            api.patch(`/schedule/jobs/${jobId}`, { techId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["unscheduled-jobs"] });
            qc.invalidateQueries({ queryKey: ["schedule-events"] });
            onClose();
        },
    });

    if (!jobId) return null;

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-xl space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-semibold">Suggested technicians</h2>
                        {data?.requiredSkills.length ? (
                            <p className="text-xs text-muted-foreground mt-1">
                                Required: {data.requiredSkills.join(", ")}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-1">No specific skills required.</p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-slate-900">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

                <div className="space-y-2">
                    {data?.candidates.map((c, idx) => {
                        const great = c.skillCoverage === 1 && c.conflicts === 0;
                        return (
                            <div key={c.techId} className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${great ? "border-emerald-300 bg-emerald-50" : ""}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {idx === 0 && great && <span className="text-emerald-600 text-xs uppercase font-bold">Best match</span>}
                                        {c.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                                        <span>Skill match: <b>{Math.round(c.skillCoverage * 100)}%</b></span>
                                        {c.conflicts > 0 ? (
                                            <span className="text-rose-600 inline-flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                {c.conflicts} time conflict{c.conflicts > 1 ? "s" : ""}
                                            </span>
                                        ) : (
                                            <span className="text-emerald-600">Free</span>
                                        )}
                                    </div>
                                    {c.skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {c.skills.map((s) => (
                                                <span key={s} className="text-[10px] bg-slate-200 rounded px-1.5 py-0.5">{s}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    disabled={assign.isPending}
                                    onClick={() => assign.mutate(c.techId)}
                                    className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-slate-800 inline-flex items-center gap-1"
                                >
                                    <Check className="h-4 w-4" /> Assign
                                </button>
                            </div>
                        );
                    })}
                    {data && data.candidates.length === 0 && (
                        <div className="text-sm text-muted-foreground italic">No technicians available.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
