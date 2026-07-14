"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { getJobTiming, STATUS_LABELS, STATUS_STYLES, type TechnicianJob } from "./types";

interface JobListProps {
    jobs: TechnicianJob[];
    activeJobId: string;
    onSelectJob: (jobId: string) => void;
}

export function JobList({ jobs, activeJobId, onSelectJob }: JobListProps) {
    return (
        <Card className="h-fit">
            <CardHeader>
                <CardTitle>Assigned today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {jobs.map((job) => (
                    <button
                        key={job.id}
                        type="button"
                        onClick={() => onSelectJob(job.id)}
                        className={`w-full rounded-xl border p-4 text-left transition ${
                            job.id === activeJobId
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-border bg-background hover:bg-slate-50"
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-semibold">{job.title}</div>
                                <div
                                    className={`text-sm ${
                                        job.id === activeJobId ? "text-slate-200" : "text-muted-foreground"
                                    }`}
                                >
                                    {job.customer.name}
                                </div>
                            </div>
                            <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    job.id === activeJobId ? "bg-white/15 text-white" : STATUS_STYLES[job.status]
                                }`}
                            >
                                {STATUS_LABELS[job.status]}
                            </span>
                        </div>
                        <div
                            className={`mt-3 text-sm ${
                                job.id === activeJobId ? "text-slate-200" : "text-muted-foreground"
                            }`}
                        >
                            {getJobTiming(job)}
                        </div>
                    </button>
                ))}
            </CardContent>
        </Card>
    );
}
