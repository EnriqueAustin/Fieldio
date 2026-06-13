"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { FileText } from "lucide-react";

export default function CreditNotesPage() {
    const qc = useQueryClient();
    const { data: notes = [], isLoading } = useQuery({
        queryKey: ["credit-notes"],
        queryFn: () => api.get("/credit-notes").then((r) => r.data.data.notes),
    });
    const issue = useMutation({
        mutationFn: (id: string) => api.post(`/credit-notes/${id}/issue`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["credit-notes"] }),
    });
    const apply = useMutation({
        mutationFn: (id: string) => api.post(`/credit-notes/${id}/apply`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["credit-notes"] }),
    });

    return (
        <div className="space-y-4">
            <div>
                <h1 className="page-title flex items-center gap-2"><FileText className="h-6 w-6" /> Credit notes</h1>
                <p className="page-subtitle">SARS-compliant credit notes to offset invoices.</p>
            </div>
            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2">Number</th>
                            <th>Customer</th>
                            <th>Invoice</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {notes.map((n: any) => (
                            <tr key={n.id} className="border-t">
                                <td className="px-4 py-2 font-mono text-xs">{n.number ?? "—"}</td>
                                <td>{n.customer?.name}</td>
                                <td>{n.invoice?.invoiceNumber ?? <span className="text-slate-400 italic">—</span>}</td>
                                <td>R {Number(n.total).toFixed(2)}</td>
                                <td>
                                    <span className={`text-xs uppercase px-2 py-0.5 rounded ${
                                        n.status === "APPLIED" ? "bg-emerald-100 text-emerald-700" :
                                        n.status === "ISSUED" ? "bg-blue-100 text-blue-700" :
                                        n.status === "VOID" ? "bg-rose-100 text-rose-700" :
                                        "bg-slate-100 text-slate-700"
                                    }`}>{n.status}</span>
                                </td>
                                <td className="space-x-2">
                                    {n.status === "DRAFT" && (
                                        <button onClick={() => issue.mutate(n.id)} className="text-xs text-blue-600 hover:underline">Issue</button>
                                    )}
                                    {n.status === "ISSUED" && n.invoiceId && (
                                        <button onClick={() => apply.mutate(n.id)} className="text-xs text-emerald-600 hover:underline">Apply</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {notes.length === 0 && !isLoading && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400 italic">No credit notes yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
