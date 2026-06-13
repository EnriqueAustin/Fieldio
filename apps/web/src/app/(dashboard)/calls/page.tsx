"use client";

import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";

export default function CallsPage() {
    const { data: calls = [], isLoading } = useQuery({
        queryKey: ["calls"],
        queryFn: () => api.get("/calls").then((r) => r.data.data.calls),
        refetchInterval: 30_000,
    });
    return (
        <div className="space-y-4">
            <div>
                <h1 className="page-title flex items-center gap-2"><Phone className="h-6 w-6" /> Call log</h1>
                <p className="page-subtitle">Inbound / outbound calls, caller-ID resolved to customers.</p>
            </div>
            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2 w-8"></th>
                            <th>From / To</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>When</th>
                        </tr>
                    </thead>
                    <tbody>
                        {calls.map((c: any) => (
                            <tr key={c.id} className="border-t">
                                <td className="px-4 py-2">
                                    {c.direction === "INBOUND" && c.status === "MISSED" ? (
                                        <PhoneMissed className="h-4 w-4 text-rose-600" />
                                    ) : c.direction === "INBOUND" ? (
                                        <PhoneIncoming className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                        <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                                    )}
                                </td>
                                <td>{c.direction === "INBOUND" ? c.fromNumber : c.toNumber}</td>
                                <td>{c.customer?.name ?? <span className="text-slate-400 italic">unknown</span>}</td>
                                <td className="uppercase text-xs">{c.status}</td>
                                <td>{Math.floor(c.durationSec / 60)}:{String(c.durationSec % 60).padStart(2, "0")}</td>
                                <td className="text-xs">{new Date(c.startedAt).toLocaleString()}</td>
                            </tr>
                        ))}
                        {calls.length === 0 && !isLoading && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400 italic">No calls yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
