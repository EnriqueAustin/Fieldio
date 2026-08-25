"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FileSignature, Filter, Send, Users } from "lucide-react";
import api from "../../lib/api";
import type { User } from "../../store/auth";
import { firstNameOf } from "../../lib/utils";
import { EmptyState, StatCard, formatMoney } from "./shared";

const STAGE_COLORS: Record<string, string> = {
    NEW: "bg-slate-400",
    CONTACTED: "bg-blue-500",
    QUALIFIED: "bg-violet-500",
    PROPOSAL: "bg-amber-500",
    WON: "bg-emerald-500",
    LOST: "bg-rose-500",
};

/**
 * Home screen for SALES. Company revenue analytics are ADMIN/OFFICE/ACCOUNTANT
 * only, so this view is built from the lead pipeline and quote endpoints the
 * sales role can call.
 */
export function SalesView({ user }: { user: User }) {
    const { data: pipeline } = useQuery({
        queryKey: ["sales-home-pipeline"],
        queryFn: () => api.get("/leads/pipeline").then((r) => r.data.data),
        refetchInterval: 60_000,
    });
    const { data: funnel } = useQuery({
        queryKey: ["sales-home-funnel"],
        queryFn: () => api.get("/leads/funnel").then((r) => r.data.data),
        refetchInterval: 60_000,
    });
    const { data: estimates } = useQuery({
        queryKey: ["sales-home-estimates"],
        queryFn: () => api.get("/finance/estimates").then((r) => r.data.data.estimates),
        refetchInterval: 60_000,
    });

    const stages: string[] = pipeline?.stages ?? [];
    const byStage: Record<string, any[]> = pipeline?.byStage ?? {};
    const openLeads = stages
        .filter((s) => s !== "WON" && s !== "LOST")
        .reduce((sum, s) => sum + (byStage[s]?.length ?? 0), 0);
    const wonLeads = byStage.WON?.length ?? 0;

    const quotes: any[] = estimates ?? [];
    const sent = quotes.filter((q) => q.status === "SENT");
    const approved = quotes.filter((q) => q.status === "APPROVED");
    const openQuoteValue = sent.reduce((sum, q) => sum + Number(q.total || 0), 0);
    const winRate = sent.length + approved.length
        ? Math.round((approved.length / (sent.length + approved.length)) * 100)
        : 0;

    const maxStage = Math.max(1, ...stages.map((s) => byStage[s]?.length ?? 0));

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title">Good day, {firstNameOf(user)}</h1>
                    <p className="page-subtitle">Your pipeline and quotes at a glance.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/leads"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                    >
                        Pipeline
                    </Link>
                    <Link
                        href="/estimates"
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                        New quote
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Link href="/leads">
                    <StatCard
                        label="Open leads"
                        value={String(openLeads)}
                        sub={`${wonLeads} won`}
                        icon={Filter}
                        accent="bg-blue-50 text-blue-600"
                    />
                </Link>
                <Link href="/estimates?status=SENT">
                    <StatCard
                        label="Quotes out"
                        value={String(sent.length)}
                        sub={`${formatMoney(openQuoteValue)} in play`}
                        icon={Send}
                        accent="bg-amber-50 text-amber-600"
                    />
                </Link>
                <Link href="/estimates?status=APPROVED">
                    <StatCard
                        label="Approved"
                        value={String(approved.length)}
                        sub="Ready to schedule"
                        icon={CheckCircle2}
                        accent="bg-emerald-50 text-emerald-600"
                    />
                </Link>
                <StatCard
                    label="Quote win rate"
                    value={`${winRate}%`}
                    sub="Approved vs decided"
                    icon={FileSignature}
                    accent="bg-violet-50 text-violet-600"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                <div className="surface-card overflow-hidden lg:col-span-4">
                    <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                        <div>
                            <h3 className="font-semibold">Pipeline by stage</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">Where every lead sits</p>
                        </div>
                        <Link
                            href="/leads"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                            Open <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="space-y-3 p-6">
                        {stages.length === 0 ? (
                            <EmptyState
                                icon={Filter}
                                title="No leads yet"
                                hint="Leads captured from bookings and calls land here."
                            />
                        ) : (
                            stages.map((stage) => {
                                const count = byStage[stage]?.length ?? 0;
                                return (
                                    <div key={stage} className="flex items-center gap-3">
                                        <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                                            {stage}
                                        </span>
                                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                            <div
                                                className={`h-full rounded-full ${STAGE_COLORS[stage] ?? "bg-slate-400"}`}
                                                style={{ width: `${(count / maxStage) * 100}%` }}
                                            />
                                        </div>
                                        <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
                                            {count}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="surface-card overflow-hidden lg:col-span-3">
                    <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                        <div>
                            <h3 className="font-semibold">Where leads come from</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Last {funnel?.periodDays ?? 90} days
                            </p>
                        </div>
                    </div>
                    <div className="divide-y divide-border/60">
                        {!funnel?.sources?.length ? (
                            <EmptyState
                                icon={Users}
                                title="No sources tracked"
                                hint="Tag lead sources to see which channels convert."
                            />
                        ) : (
                            funnel.sources.slice(0, 6).map((s: any) => (
                                <div key={s.sourceId ?? s.source} className="px-6 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-medium">{s.source}</p>
                                        <span className="shrink-0 text-sm tabular-nums">{s.leads}</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {s.won} won · {formatMoney(s.revenue)} revenue
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
