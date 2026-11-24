"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { AlertOctagon, Briefcase, MapPin, Phone, Sparkles, Clock, GripVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Draggable } from "@fullcalendar/interaction";
import { JOB_DRAG_MIME } from "./dispatch-board";

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

/** "fullcalendar" wires FullCalendar's Draggable (calendar view); "native" uses
 *  HTML5 drag-and-drop carrying JOB_DRAG_MIME for the lane board. */
export type UnscheduledDragMode = "fullcalendar" | "native";

const PRIORITY_STYLES: Record<string, string> = {
    EMERGENCY:
        "bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-100",
    HIGH: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-100",
    MEDIUM: "bg-card border-border",
    LOW: "bg-muted/40 border-border",
};

export function UnscheduledJobsPanel({
    onJobClick,
    onSuggestTechClick,
    dragMode = "fullcalendar",
}: {
    onJobClick: (jobId: string) => void;
    onSuggestTechClick: (jobId: string) => void;
    dragMode?: UnscheduledDragMode;
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    const { data: jobs = [], isLoading, refetch } = useQuery<UnscheduledJob[]>({
        queryKey: ["unscheduled-jobs"],
        queryFn: () => api.get("/schedule/unscheduled").then((r) => r.data.data.jobs),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        // The board uses native drag-and-drop; a FullCalendar Draggable would
        // swallow the pointer events, so only create it for the calendar view.
        if (dragMode !== "fullcalendar" || !containerRef.current) return;
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
    }, [jobs.length, dragMode]);

    return (
        <div className="surface-card flex flex-col h-full">
            <div className="border-b border-border/70 p-4 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold flex items-center gap-2">
                        <Briefcase className="h-4 w-4" /> Unscheduled
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {jobs.length} waiting · drag onto the {dragMode === "native" ? "board" : "calendar"} to schedule
                    </p>
                </div>
                <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
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
                {jobs.map((j) => {
                    const dragTitle = `${j.title} - ${j.customerName}`;
                    return (
                        <div
                            key={j.id}
                            data-draggable-job
                            data-job-id={j.id}
                            data-job-title={dragTitle}
                            draggable={dragMode === "native"}
                            onDragStart={
                                dragMode === "native"
                                    ? (e) => {
                                          e.dataTransfer.setData(
                                              JOB_DRAG_MIME,
                                              JSON.stringify({ jobId: j.id, title: dragTitle })
                                          );
                                          e.dataTransfer.effectAllowed = "move";
                                      }
                                    : undefined
                            }
                            className={`rounded-lg border p-2.5 ${PRIORITY_STYLES[j.priority] ?? PRIORITY_STYLES.MEDIUM} cursor-grab active:cursor-grabbing transition hover:shadow-sm`}
                        >
                            <div className="flex items-start gap-1.5">
                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-1">
                                        <button
                                            onClick={() => onJobClick(j.id)}
                                            className="text-sm font-medium text-left hover:underline truncate flex-1"
                                        >
                                            {j.title}
                                        </button>
                                        {j.priority === "EMERGENCY" && (
                                            <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
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
                                                <span key={s} className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => onSuggestTechClick(j.id)}
                                        className="mt-2 w-full text-xs bg-primary text-primary-foreground rounded-lg py-1.5 hover:bg-primary/90 inline-flex items-center justify-center gap-1"
                                    >
                                        <Sparkles className="h-3 w-3" /> Suggest tech
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
