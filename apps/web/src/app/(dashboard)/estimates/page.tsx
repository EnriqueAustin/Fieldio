"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "../../../lib/api";
import { FileSignature, Plus, Search, ArrowUpRight } from "lucide-react";
import { StatusPill } from "../../../components/ui/status-pill";
import { CreateEstimateDialog } from "../../../components/estimates/create-estimate-dialog";

interface EstimateRow {
    id: string;
    status: string;
    total: string;
    validUntil: string | null;
    createdAt: string;
    customer: { name: string } | null;
}

const STATUS_TABS = ["ALL", "DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED"] as const;

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EstimatesPage() {
    const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("ALL");
    const [search, setSearch] = useState("");
    const [creating, setCreating] = useState(false);
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ["estimates"],
        queryFn: () => api.get("/finance/estimates").then((r) => r.data.data.estimates ?? []),
    });

    const estimates: EstimateRow[] = data ?? [];

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: estimates.length };
        for (const e of estimates) c[e.status] = (c[e.status] ?? 0) + 1;
        return c;
    }, [estimates]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return estimates.filter((e) => {
            if (tab !== "ALL" && e.status !== tab) return false;
            if (q && !(e.customer?.name ?? "").toLowerCase().includes(q) && !e.id.toLowerCase().includes(q))
                return false;
            return true;
        });
    }, [estimates, tab, search]);

    const pipelineValue = filtered.reduce((sum, e) => sum + Number(e.total), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Quotes</h1>
                    <p className="page-subtitle">
                        Build, send and track customer estimates through your pipeline.
                    </p>
                </div>
                <button
                    onClick={() => setCreating(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
                >
                    <Plus className="h-4 w-4" />
                    New quote
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {STATUS_TABS.map((s) => (
                    <button
                        key={s}
                        onClick={() => setTab(s)}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                            tab === s
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-border text-muted-foreground hover:bg-slate-50"
                        }`}
                    >
                        {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                        <span
                            className={`rounded-full px-1.5 text-[11px] ${
                                tab === s ? "bg-white/20" : "bg-slate-100 text-slate-600"
                            }`}
                        >
                            {counts[s] ?? 0}
                        </span>
                    </button>
                ))}
            </div>

            <div className="surface-card p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by customer or quote id…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="surface-card h-96 animate-pulse" />
            ) : filtered.length === 0 ? (
                <div className="surface-card flex flex-col items-center text-center py-16 px-6">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <FileSignature className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium">No quotes here</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Create a quote to start winning work.
                    </p>
                </div>
            ) : (
                <div className="surface-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                            {filtered.length} quote{filtered.length !== 1 ? "s" : ""}
                        </span>
                        <span>
                            Pipeline value: <span className="font-semibold text-foreground">{formatCurrency(pipelineValue)}</span>
                        </span>
                    </div>
                    <div className="divide-y divide-border/60">
                        {filtered.map((e) => (
                            <Link
                                key={e.id}
                                href={`/estimates/${e.id}`}
                                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/70 transition group"
                            >
                                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                    <FileSignature className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">
                                            {e.customer?.name ?? "Unknown customer"}
                                        </span>
                                        <StatusPill status={e.status} />
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        #{e.id.slice(0, 8)} · created {formatDate(e.createdAt)}
                                        {e.validUntil ? ` · valid until ${formatDate(e.validUntil)}` : ""}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-semibold text-sm">{formatCurrency(Number(e.total))}</div>
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <CreateEstimateDialog
                open={creating}
                onOpenChange={setCreating}
                onCreated={() => qc.invalidateQueries({ queryKey: ["estimates"] })}
            />
        </div>
    );
}
