"use client";

import { MapPin, Clock, ChevronRight } from "lucide-react";
import {
    getJobTiming,
    getLocationLabel,
    PRIORITY_BADGE,
    STATUS_LABELS,
    STATUS_STYLES,
    type TechnicianJob,
} from "./types";

interface JobCardProps {
    job: TechnicianJob;
    active?: boolean;
    onSelect: (jobId: string) => void;
}

/** Tappable job summary card used by both the mobile home list and the desktop
 *  sidebar. ≥44px hit area, shows suburb, time/on-site, status + priority. */
export function JobCard({ job, active = false, onSelect }: JobCardProps) {
    const priority = PRIORITY_BADGE[job.priority];
    const emergency = job.priority === "EMERGENCY";

    return (
        <button
            type="button"
            onClick={() => onSelect(job.id)}
            className={`w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] min-h-[44px] ${
                active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : emergency
                    ? "border-red-300 bg-red-50 hover:bg-red-100"
                    : "border-border bg-background hover:bg-slate-50"
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {priority && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                    active ? "bg-white/20 text-white" : priority.className
                                }`}
                            >
                                {priority.label}
                            </span>
                        )}
                        <span className="truncate font-semibold">{job.title}</span>
                    </div>
                    <div
                        className={`mt-1 text-sm ${
                            active ? "text-slate-200" : "text-muted-foreground"
                        }`}
                    >
                        {job.customer.name}
                    </div>
                </div>
                <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        active ? "bg-white/15 text-white" : STATUS_STYLES[job.status]
                    }`}
                >
                    {STATUS_LABELS[job.status]}
                </span>
            </div>

            <div
                className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${
                    active ? "text-slate-200" : "text-muted-foreground"
                }`}
            >
                <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {getJobTiming(job)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {getLocationLabel(job)}
                </span>
                <ChevronRight
                    className={`ml-auto h-4 w-4 ${active ? "text-slate-300" : "text-slate-400"}`}
                />
            </div>
        </button>
    );
}
