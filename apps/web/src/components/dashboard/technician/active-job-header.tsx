"use client";

import { Phone, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { getAddress, getJobTiming, STATUS_LABELS, STATUS_STYLES, type TechnicianJob } from "./types";

interface ActiveJobHeaderProps {
    job: TechnicianJob;
    nextStatus: TechnicianJob["status"] | null;
    canComplete: boolean;
    mapsHref: string;
    onChangeStatus: (status: TechnicianJob["status"]) => void;
}

export function ActiveJobHeader({ job, nextStatus, canComplete, mapsHref, onChangeStatus }: ActiveJobHeaderProps) {
    const commsHint =
        job.status === "ASSIGNED"
            ? "“Start route” texts the customer a live tracking link automatically."
            : job.status === "EN_ROUTE"
            ? "Customer has the tracking link — they’re notified you’re on the way."
            : job.status === "ON_SITE"
            ? "Customer was notified you arrived. Completing emails them a job summary."
            : job.status === "COMPLETED"
            ? "Customer was emailed the completion summary automatically."
            : null;

    return (
        <Card>
            <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{job.title}</CardTitle>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[job.status]}`}>
                            {STATUS_LABELS[job.status]}
                        </span>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                        <div>{job.customer.name}</div>
                        <div>{getAddress(job)}</div>
                        <div>{getJobTiming(job)}</div>
                    </div>
                    {commsHint ? (
                        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{commsHint}</span>
                        </div>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    {nextStatus && job.status !== "ON_SITE" && (
                        <Button onClick={() => onChangeStatus(nextStatus)}>
                            {job.status === "ASSIGNED" ? "Start route" : "Arrive on site"}
                        </Button>
                    )}
                    {job.status === "ON_SITE" && (
                        <Button onClick={() => onChangeStatus("COMPLETED")} disabled={!canComplete}>
                            Complete job
                        </Button>
                    )}
                    <Button asChild variant="outline">
                        <a href={mapsHref} target="_blank" rel="noreferrer">
                            <Route className="mr-2 h-4 w-4" />
                            Open route
                        </a>
                    </Button>
                </div>
            </CardHeader>
            {!canComplete && job.status === "ON_SITE" && (
                <CardContent className="pt-0">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Complete every checklist item and capture a customer signature before closing this job.
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
