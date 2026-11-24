"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api from "../../../lib/api";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { StatusPill } from "../../../components/ui/status-pill";
import { Briefcase, Plus, Search, Calendar as CalIcon, Zap, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "../../../lib/utils";
import { downloadCsv, csvDate, csvSlug, type CsvColumn } from "../../../lib/csv";
import { toast } from "../../../components/ui/use-toast";

interface Job {
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduledStart: string | null;
    customer: { name: string };
    tech: { email: string } | null;
}

// GET /jobs returns a page of rows plus pagination meta. There is no per-status
// count endpoint, so the filter tabs carry no badge counts.
interface JobsResponse {
    items: Job[];
    total: number;
    page: number;
    totalPages: number;
}

const FILTERS = ["ALL", "REQUESTED", "ASSIGNED", "EN_ROUTE", "ON_SITE", "PAUSED", "COMPLETED"] as const;
type FilterValue = (typeof FILTERS)[number];
const LIMIT = 25;

interface Branch { id: string; name: string }

export default function JobsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const statusParam = (searchParams.get("status") ?? "ALL") as FilterValue;
    const filter: FilterValue = (FILTERS as readonly string[]).includes(statusParam) ? statusParam : "ALL";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);

    // Search has no server-side param on GET /jobs, so it filters the current
    // page client-side only.
    const [query, setQuery] = useState(searchParams.get("q") ?? "");
    const [branchId, setBranchId] = useState<string>(
        () =>
            searchParams.get("branchId") ??
            (typeof window !== "undefined" ? localStorage.getItem("branchFilter") ?? "" : "")
    );

    // Reflect filter / page / branch into the URL so the view is shareable and
    // survives a refresh. Defaults (ALL / empty) are dropped from the query.
    const updateUrl = (patch: Record<string, string | number | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === "" || v === "ALL") params.delete(k);
            else params.set(k, String(v));
        }
        const qs = params.toString();
        router.replace(qs ? `/jobs?${qs}` : "/jobs");
    };

    const { data: branchesData } = useQuery<Branch[]>({
        queryKey: ["branches"],
        queryFn: () => api.get("/branches").then((r) => r.data.data.branches),
    });
    const branches = branchesData ?? [];

    const { data, isLoading: loading } = useQuery<JobsResponse>({
        queryKey: ["jobs", filter, page, branchId],
        queryFn: () =>
            api
                .get("/jobs", {
                    params: {
                        page,
                        limit: LIMIT,
                        ...(filter !== "ALL" ? { status: filter } : {}),
                        ...(branchId ? { branchId } : {}),
                    },
                })
                .then((res) => res.data.data as JobsResponse),
    });

    const jobs = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = data?.totalPages ?? 1;

    const visible = useMemo(() => {
        if (!query) return jobs;
        const q = query.toLowerCase();
        return jobs.filter((j) =>
            `${j.title} ${j.customer?.name ?? ""} ${j.tech?.email ?? ""}`.toLowerCase().includes(q)
        );
    }, [jobs, query]);

    const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const rangeEnd = Math.min(page * LIMIT, total);

    // Export every job matching the current status/branch filters — not just the
    // visible page. Loops the paginated endpoint with a high limit, capped.
    const [exporting, setExporting] = useState(false);
    const [exportCount, setExportCount] = useState(0);

    const exportAll = async () => {
        const EXPORT_LIMIT = 200;
        const EXPORT_CAP = 10000;
        setExporting(true);
        setExportCount(0);
        try {
            const all: Job[] = [];
            let p = 1;
            let pages = 1;
            do {
                const res = await api
                    .get("/jobs", {
                        params: {
                            page: p,
                            limit: EXPORT_LIMIT,
                            ...(filter !== "ALL" ? { status: filter } : {}),
                            ...(branchId ? { branchId } : {}),
                        },
                    })
                    .then((r) => r.data.data as JobsResponse);
                all.push(...res.items);
                pages = res.totalPages ?? 1;
                setExportCount(all.length);
                p++;
            } while (p <= pages && all.length < EXPORT_CAP);

            // Apply the same client-side search the table uses, so the file reflects
            // what the user has narrowed the view to.
            const q = query.trim().toLowerCase();
            const rows = q
                ? all.filter((j) =>
                      `${j.title} ${j.customer?.name ?? ""} ${j.tech?.email ?? ""}`.toLowerCase().includes(q)
                  )
                : all;

            const cols: CsvColumn<Job>[] = [
                { header: "Job ID", value: (j) => j.id },
                { header: "Title", value: (j) => j.title },
                { header: "Customer", value: (j) => j.customer?.name ?? "" },
                { header: "Status", value: (j) => j.status },
                { header: "Priority", value: (j) => j.priority },
                { header: "Scheduled", value: (j) => csvDate(j.scheduledStart) },
                { header: "Technician", value: (j) => j.tech?.email ?? "" },
            ];
            const parts = ["jobs", filter !== "ALL" ? csvSlug(filter) : "", q ? csvSlug(q) : ""].filter(Boolean);
            downloadCsv(`${parts.join("-")}.csv`, cols, rows);
        } catch {
            toast({ title: "Failed to export jobs", variant: "destructive" });
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Jobs</h1>
                    <p className="page-subtitle">Manage all service requests and operations.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportAll}
                        disabled={exporting || total === 0}
                        title="Exports every job matching the current filters, across all pages"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        {exporting ? `Exporting… ${exportCount}` : "Export all matches"}
                    </button>
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
                        onChange={(e) => {
                            setQuery(e.target.value);
                            updateUrl({ q: e.target.value || undefined });
                        }}
                        placeholder="Search this page by job title, customer or technician…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </div>
                {branches.length > 0 && (
                    <select
                        value={branchId}
                        onChange={(e) => {
                            setBranchId(e.target.value);
                            if (typeof window !== "undefined") localStorage.setItem("branchFilter", e.target.value);
                            updateUrl({ branchId: e.target.value || undefined, page: 1 });
                        }}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium"
                    >
                        <option value="">All branches</option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                )}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
                    {FILTERS.map((f) => {
                        const active = filter === f;
                        return (
                            <button
                                key={f}
                                onClick={() => updateUrl({ status: f, page: 1 })}
                                className={cn(
                                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                    active
                                        ? "bg-slate-900 text-white"
                                        : "text-muted-foreground hover:bg-slate-100"
                                )}
                            >
                                {f === "ALL" ? "All" : f.replace("_", " ")}
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
                        ) : visible.length === 0 ? (
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
                            visible.map((job) => (
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

                {/* Pager — totals come straight from the API's pagination meta */}
                {!loading && total > 0 && (
                    <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
                        <p className="text-xs text-muted-foreground">
                            Showing {rangeStart}–{rangeEnd} of {total}
                            {query && (
                                <span className="ml-1">({visible.length} match on this page)</span>
                            )}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => updateUrl({ page: page - 1 })}
                                disabled={page <= 1}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" /> Prev
                            </button>
                            <span className="text-xs text-muted-foreground">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => updateUrl({ page: page + 1 })}
                                disabled={page >= totalPages}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Next <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
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
