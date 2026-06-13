"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { FileText, Mail } from "lucide-react";

export default function StatementsPage() {
    const qc = useQueryClient();
    const [customerId, setCustomerId] = useState("");
    const [start, setStart] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
    const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));

    const { data: customers = [] } = useQuery({
        queryKey: ["customers-light"],
        queryFn: () => api.get("/customers?limit=100").then((r) => r.data.data.items ?? []),
    });
    const { data: statements = [], isLoading } = useQuery({
        queryKey: ["statements"],
        queryFn: () => api.get("/statements").then((r) => r.data.data.statements),
    });

    const build = useMutation({
        mutationFn: () => api.post("/statements/build", { customerId, periodStart: start, periodEnd: end }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["statements"] }),
    });
    const email = useMutation({
        mutationFn: (id: string) => api.post(`/statements/${id}/email`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["statements"] }),
    });

    return (
        <div className="space-y-4">
            <div>
                <h1 className="page-title flex items-center gap-2"><FileText className="h-6 w-6" /> Customer statements</h1>
                <p className="page-subtitle">Monthly statements with opening/closing balances.</p>
            </div>

            <div className="surface-card p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded border px-3 py-2 text-sm">
                    <option value="">Select customer…</option>
                    {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                <button onClick={() => build.mutate()} disabled={!customerId || build.isPending} className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-slate-800">
                    {build.isPending ? "Building…" : "Build statement"}
                </button>
            </div>

            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2">Customer</th>
                            <th>Period</th>
                            <th>Opening</th>
                            <th>Closing</th>
                            <th>Built</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {statements.map((s: any) => (
                            <tr key={s.id} className="border-t">
                                <td className="px-4 py-2">{s.customer?.name}</td>
                                <td className="text-xs">{new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}</td>
                                <td>R {Number(s.openingBalance).toFixed(2)}</td>
                                <td className="font-semibold">R {Number(s.closingBalance).toFixed(2)}</td>
                                <td className="text-xs">{new Date(s.createdAt).toLocaleString()}</td>
                                <td>
                                    <button onClick={() => email.mutate(s.id)} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                        <Mail className="h-3 w-3" /> Email
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {statements.length === 0 && !isLoading && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400 italic">No statements yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
