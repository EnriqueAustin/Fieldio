"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { AlertOctagon, Briefcase, MapPin, Phone, Sparkles, Clock, GripVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Draggable } from "@fullcalendar/interaction";

interface UnscheduledJob {
    id: string;
    title: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
    customerName: string;
    customerPhone: string | null;
    address: string;
    requiredSkills: string[];
    createdAt: string;
    scheduledStart: string | null;
    techId: string | null;
    status: string;
}

const PRIORITY_STYLES: Record<string, string> = {
    EMERGENCY: "bg-rose-50 border-rose-300 text-rose-900",
    HIGH: "bg-amber-50 border-amber-300 text-amber-900",
    MEDIUM: "bg-white border-border",
    LOW: "bg-slate-50 border-border",
};

export function UnscheduledJobsPanel({
    onJobClick,
    onSuggestTechClick,
}: {
    onJobClick: (jobId: string) => void;
    onSuggestTechClick: (jobId: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    const { data: jobs = [], isLoading, refetch } = useQuery<UnscheduledJob[]>({
        queryKey: ["unscheduled-jobs"],
        queryFn: () => api.get("/schedule/unscheduled").then((r) => r.data.data.jobs),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (!containerRef.current) return;
        const draggable = new Draggable(containerRef.current, {
            itemSelector: "[data-draggable-job]",
            eventData: (el) => {
                const jobId = el.getAttribute("data-job-id") || "";
                const title = el.getAttribute("data-job-title") || "Job";
                return {
                    id: jobId,
                    title,
                    duration: "01:00",
                    create: true,
                };
            },
        });
        return () => {
            draggable.destroy();
        };
    }, [jobs.length]);

    return (
        <div className="surface-card flex flex-col h-full">
            <div className="border-b border-border/70 p-4 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold flex items-center gap-2">
                        <Briefcase className="h-4 w-4" /> Unscheduled
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {jobs.length} waiting · drag onto calendar to schedule
                    </p>
                </div>
                <button onClick={() => refetch()} className="text-xs text-blue-600 hover:underline">
                    Refresh
                </button>
            </div>

            <div ref={containerRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                {isLoading && (
                    <div className="text-sm text-muted-foreground p-3">Loading…</div>
                )}
                {!isLoading && jobs.length === 0 && (
                    <div className="text-sm text-muted-foreground p-6 text-center italic">
                        All jobs scheduled.
                    </div>
                )}
                {jobs.map((j) => (
                    <div
                        key={j.id}
                        data-draggable-job
                        data-job-id={j.id}
                        data-job-title={`${j.title} - ${j.customerName}`}
                        className={`rounded-lg border p-2.5 ${PRIORITY_STYLES[j.priority]} cursor-grab active:cursor-grabbing transition hover:shadow-sm`}
                    >
                        <div className="flex items-start gap-1.5">
                            <GripVertical className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1">
                                    <button
                                        onClick={() => onJobClick(j.id)}
                                        className="text-sm font-medium text-left hover:underline truncate flex-1"
                                    >
                                        {j.title}
                                    </button>
                                    {j.priority === "EMERGENCY" && (
                                        <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />
                                    )}
                                </div>
                                <div className="text-xs mt-1 space-y-0.5">
                                    <div>{j.customerName}</div>
                                    <div className="text-muted-foreground flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate">{j.address}</span>
                                    </div>
                                    {j.customerPhone && (
                                        <div className="text-muted-foreground flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            <a href={`tel:${j.customerPhone}`} className="hover:underline">
                                                {j.customerPhone}
                                            </a>
                                        </div>
                                    )}
                                    <div className="text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        <span>{formatDistanceToNow(new Date(j.createdAt))} ago</span>
                                    </div>
                                </div>
                                {j.requiredSkills.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {j.requiredSkills.map((s) => (
                                            <span key={s} className="text-[10px] bg-slate-200 text-slate-700 rounded px-1.5 py-0.5">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={() => onSuggestTechClick(j.id)}
                                    className="mt-2 w-full text-xs bg-slate-900 text-white rounded-lg py-1.5 hover:bg-slate-800 inline-flex items-center justify-center gap-1"
                                >
                                    <Sparkles className="h-3 w-3" /> Suggest tech
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
