"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { StatusPill } from "../../../components/ui/status-pill";
import { Briefcase, Plus, Search, Filter, Calendar as CalIcon, Zap } from "lucide-react";
import { cn } from "../../../lib/utils";

interface Job {
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduledStart: string | null;
    customer: { name: string };
    tech: { email: string } | null;
}

const FILTERS = ["ALL", "REQUESTED", "ASSIGNED", "EN_ROUTE", "ON_SITE", "COMPLETED"] as const;

interface Branch { id: string; name: string }

export default function JobsPage() {
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
    const [query, setQuery] = useState("");
    const [branchId, setBranchId] = useState<string>(() =>
        (typeof window !== "undefined" && localStorage.getItem("branchFilter")) || ""
    );

    const { data: branchesData } = useQuery<Branch[]>({
        queryKey: ["branches"],
        queryFn: () => api.get("/branches").then(r => r.data.data.branches),
    });
    const branches = branchesData ?? [];

    const { data, isLoading: loading } = useQuery({
        queryKey: ["jobs", branchId],
        queryFn: () => api.get("/jobs", { params: branchId ? { branchId } : {} })
            .then((res) => res.data.data.items ?? []),
    });
    const jobs: Job[] = data ?? [];

    const filtered = useMemo(() => {
        return jobs
            .filter((j) => filter === "ALL" || j.status === filter)
            .filter((j) =>
                query
                    ? `${j.title} ${j.customer?.name} ${j.tech?.email ?? ""}`
                          .toLowerCase()
                          .includes(query.toLowerCase())
                    : true
            );
    }, [jobs, filter, query]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: jobs.length };
        for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
        return c;
    }, [jobs]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Jobs</h1>
                    <p className="page-subtitle">Manage all service requests and operations.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/jobs/quick"
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition"
                    >
                        <Zap className="h-4 w-4" />
                        Quick Job
                    </Link>
                    <Link
                        href="/schedule"
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
                    >
                        <Plus className="h-4 w-4" />
                        Schedule new job
                    </Link>
                </div>
            </div>

            {/* Toolbar */}
            <div className="surface-card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by job title, customer or technician…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
                {branches.length > 0 && (
                    <select
                        value={branchId}
                        onChange={(e) => {
                            setBranchId(e.target.value);
                            if (typeof window !== "undefined") localStorage.setItem("branchFilter", e.target.value);
                        }}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium"
                    >
                        <option value="">All branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                )}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
                    {FILTERS.map((f) => {
                        const active = filter === f;
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                    active
                                        ? "bg-slate-900 text-white"
                                        : "text-muted-foreground hover:bg-slate-100"
                                )}
                            >
                                {f === "ALL" ? "All" : f.replace("_", " ")}
                                <span
                                    className={cn(
                                        "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px]",
                                        active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                                    )}
                                >
                                    {counts[f] ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Table */}
            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <Th>Job</Th>
                            <Th>Customer</Th>
                            <Th>Status</Th>
                            <Th>Scheduled</Th>
                            <Th>Technician</Th>
                            <Th className="text-right">Actions</Th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-6 py-3">
                                        <div className="h-6 rounded bg-slate-100 animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="flex flex-col items-center text-center py-16">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                            <Briefcase className="h-5 w-5" />
                                        </div>
                                        <p className="mt-3 text-sm font-medium">No jobs match your filter</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Try clearing the search or schedule a new job.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filtered.map((job) => (
                                <tr key={job.id} className="hover:bg-slate-50/70 transition">
                                    <td className="px-6 py-3.5">
                                        <Link
                                            href={`/jobs/${job.id}`}
                                            className="font-medium text-foreground hover:text-blue-600 transition"
                                        >
                                            {job.title}
                                        </Link>
                                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                                            #{job.id.substring(0, 8)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm">{job.customer?.name}</td>
                                    <td className="px-6 py-3.5">
                                        <StatusPill status={job.status} />
                                    </td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground">
                                        {job.scheduledStart ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <CalIcon className="h-3.5 w-3.5" />
                                                {format(new Date(job.scheduledStart), "MMM d, h:mm a")}
                                            </span>
                                        ) : (
                                            <span className="italic text-slate-400">Unscheduled</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        {job.tech ? (
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-7 w-7">
                                                    <AvatarFallback className="bg-slate-100 text-slate-700 text-[10px] font-medium">
                                                        {job.tech.email[0].toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                                                    {job.tech.email}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs italic text-slate-400">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5 text-right">
                                        <Link
                                            href={`/jobs/${job.id}`}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                        >
                                            View →
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <th
            className={cn(
                "px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                className
            )}
        >
            {children}
        </th>
    );
}
