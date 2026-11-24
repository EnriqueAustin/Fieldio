"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";

interface PickerJob {
    id: string;
    title: string;
    scheduledStart: string | null;
    customer: { name: string } | null;
}

interface JobsResponse {
    items: PickerJob[];
    total: number;
    page: number;
    totalPages: number;
}

interface JobPickerProps {
    value: string;
    onChange: (jobId: string) => void;
    placeholder?: string;
    /** How many jobs to pull for client-side search. GET /jobs has no search param. */
    limit?: number;
}

/**
 * Searchable job selector. GET /jobs is paginated with no server-side search, so
 * we pull a page and filter client-side by title or customer name — enough for
 * picking a recent job without pasting a raw UUID. Generic/reusable.
 */
export function JobPicker({ value, onChange, placeholder = "Select a job", limit = 100 }: JobPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { data, isLoading } = useQuery<JobsResponse>({
        queryKey: ["job-picker", limit],
        queryFn: () =>
            api.get("/jobs", { params: { page: 1, limit } }).then((r) => r.data.data as JobsResponse),
    });

    const jobs = data?.items ?? [];
    const selected = jobs.find((j) => j.id === value) ?? null;

    const visible = useMemo(() => {
        if (!query) return jobs;
        const q = query.toLowerCase();
        return jobs.filter((j) => `${j.title} ${j.customer?.name ?? ""}`.toLowerCase().includes(q));
    }, [jobs, query]);

    const label = (j: PickerJob) => {
        const parts = [j.customer?.name, j.scheduledStart ? format(new Date(j.scheduledStart), "MMM d, yyyy") : null]
            .filter(Boolean)
            .join(" · ");
        return { title: j.title, sub: parts };
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                    {selected ? (
                        <span className="truncate">
                            <span className="font-medium">{selected.title}</span>
                            {selected.customer?.name && (
                                <span className="text-muted-foreground"> · {selected.customer.name}</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by job or customer"
                        className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                    {isLoading ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
                    ) : visible.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No jobs found</p>
                    ) : (
                        visible.map((j) => {
                            const { title, sub } = label(j);
                            return (
                                <button
                                    key={j.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(j.id);
                                        setOpen(false);
                                        setQuery("");
                                    }}
                                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                                >
                                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", j.id === value ? "opacity-100" : "opacity-0")} />
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{title}</span>
                                        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
