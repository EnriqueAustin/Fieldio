"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { FilePlus, Plus, Trash2 } from "lucide-react";

export default function JobTemplatesPage() {
    const qc = useQueryClient();
    const { data: templates = [] } = useQuery({
        queryKey: ["job-templates"],
        queryFn: () => api.get("/job-templates").then((r) => r.data.data.templates),
    });

    const [showNew, setShowNew] = useState(false);
    const [name, setName] = useState("");
    const [duration, setDuration] = useState(60);
    const [skills, setSkills] = useState("");
    const [items, setItems] = useState<{ name: string; quantity: number; unitPrice: number }[]>([]);

    const create = useMutation({
        mutationFn: () =>
            api.post("/job-templates", {
                name,
                defaultDurationMin: duration,
                requiredSkills: skills.split(",").map((s) => s.trim()).filter(Boolean),
                defaultLineItems: items,
                defaultChecklist: [],
            }),
        onSuccess: () => {
            setShowNew(false);
            setName("");
            setItems([]);
            qc.invalidateQueries({ queryKey: ["job-templates"] });
        },
    });

    const del = useMutation({
        mutationFn: (id: string) => api.delete(`/job-templates/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["job-templates"] }),
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title flex items-center gap-2"><FilePlus className="h-6 w-6" /> Job templates</h1>
                    <p className="page-subtitle">Reusable playbooks — line items + checklist — for one-click job creation.</p>
                </div>
                <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">
                    <Plus className="h-4 w-4" /> New template
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((t: any) => (
                    <div key={t.id} className="surface-card p-4">
                        <div className="flex justify-between items-start">
                            <div className="font-semibold">{t.name}</div>
                            <button onClick={() => del.mutate(t.id)} className="text-slate-400 hover:text-rose-600">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{t.defaultDurationMin ?? "—"} min · {t.defaultPriority}</div>
                        {t.requiredSkills?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {t.requiredSkills.map((s: string) => (
                                    <span key={s} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{s}</span>
                                ))}
                            </div>
                        )}
                        <div className="text-xs text-slate-500 mt-2">
                            {(t.defaultLineItems as any[])?.length ?? 0} line items
                        </div>
                    </div>
                ))}
                {templates.length === 0 && (
                    <div className="surface-card p-6 text-center text-sm text-slate-500 italic md:col-span-3">
                        No templates yet. Create one to speed up dispatch.
                    </div>
                )}
            </div>

            {showNew && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
                        <h2 className="text-lg font-semibold">New template</h2>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="w-full rounded border px-3 py-2 text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} placeholder="Duration (min)" className="rounded border px-3 py-2 text-sm" />
                            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills (csv)" className="rounded border px-3 py-2 text-sm" />
                        </div>
                        <div className="text-sm font-medium">Line items</div>
                        {items.map((it, i) => (
                            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-1 items-center">
                                <input value={it.name} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="rounded border px-2 py-1 text-sm" />
                                <input type="number" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} placeholder="Qty" className="rounded border px-2 py-1 text-sm" />
                                <input type="number" value={it.unitPrice} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPrice: Number(e.target.value) } : x))} placeholder="R Price" className="rounded border px-2 py-1 text-sm" />
                                <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        ))}
                        <button onClick={() => setItems([...items, { name: "", quantity: 1, unitPrice: 0 }])} className="text-xs text-blue-600">+ Add item</button>

                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowNew(false)} className="text-sm px-3 py-2">Cancel</button>
                            <button onClick={() => create.mutate()} disabled={!name || create.isPending} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-800">
                                {create.isPending ? "Saving…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
