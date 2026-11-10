"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { JobCard } from "./job-card";
import { getDoneToday, type TechnicianJob } from "./types";

interface DoneTodaySectionProps {
    jobs: TechnicianJob[];
    activeJobId?: string;
    onOpenJob: (jobId: string) => void;
}

/** Collapsed-by-default list of jobs finished today. Completed jobs used to
 *  vanish instantly, so the tech couldn't send the pay link/summary or add
 *  after-photos. Keeping them here (one tap to reopen) fixes that without
 *  cluttering the active job buckets. Renders nothing when nothing's done. */
export function DoneTodaySection({ jobs, activeJobId, onOpenJob }: DoneTodaySectionProps) {
    const [open, setOpen] = useState(false);
    const done = getDoneToday(jobs);
    if (done.length === 0) return null;

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-1 text-left"
                aria-expanded={open}
            >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Done today
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {done.length}
                </span>
                <ChevronDown
                    className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && (
                <div className="space-y-2">
                    {done.map((job) => (
                        <JobCard
                            key={job.id}
                            job={job}
                            active={job.id === activeJobId}
                            onSelect={onOpenJob}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
