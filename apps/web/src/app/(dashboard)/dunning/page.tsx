"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { AlertTriangle, Play, Trash2 } from "lucide-react";

export default function DunningPage() {
    const qc = useQueryClient();
    const { data: rules = [], isLoading } = useQuery({
        queryKey: ["dunning-rules"],
        queryFn: () => api.get("/dunning/rules").then((r) => r.data.data.rules),
    });
    const seed = useMutation({
        mutationFn: () => api.post("/dunning/seed"),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["dunning-rules"] }),
    });
    const runNow = useMutation({
        mutationFn: () => api.post("/dunning/run-now").then((r) => r.data.data),
    });
    const del = useMutation({
        mutationFn: (id: string) => api.delete(`/dunning/rules/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["dunning-rules"] }),
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title flex items-center gap-2"><AlertTriangle className="h-6 w-6" /> Dunning rules</h1>
                    <p className="page-subtitle">Automated overdue-invoice reminders across email / SMS / WhatsApp.</p>
                </div>
                <div className="flex gap-2">
                    {rules.length === 0 && (
                        <button onClick={() => seed.mutate()} className="bg-slate-100 rounded-lg px-3 py-2 text-sm hover:bg-slate-200">
                            Seed default rules
                        </button>
                    )}
                    <button onClick={() => runNow.mutate()} disabled={runNow.isPending} className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1 hover:bg-slate-800">
                        <Play className="h-4 w-4" /> {runNow.isPending ? "Running…" : "Run sweep now"}
                    </button>
                </div>
            </div>

            {runNow.data && (
                <div className="surface-card p-3 text-sm">
                    Sent <b>{runNow.data.sent}</b> reminders across <b>{runNow.data.scanned}</b> overdue invoices.
                </div>
            )}

            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2">Days after due</th>
                            <th>Channel</th>
                            <th>Subject</th>
                            <th>Active</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rules.map((r: any) => (
                            <tr key={r.id} className="border-t">
                                <td className="px-4 py-2 font-mono">{r.daysAfterDue}d</td>
                                <td className="uppercase">{r.channel}</td>
                                <td className="text-xs">{r.subject ?? r.body.slice(0, 50)}…</td>
                                <td>{r.active ? "✓" : "—"}</td>
                                <td><button onClick={() => del.mutate(r.id)} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></td>
                            </tr>
                        ))}
                        {rules.length === 0 && !isLoading && (
                            <tr><td colSpan={5} className="text-center py-6 text-slate-400 italic">No rules yet — click "Seed default rules".</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
