"use client";

import { useState } from "react";
import { format } from "date-fns";
import { MapPin, Navigation, Phone, Clock, ChevronDown } from "lucide-react";
import { Card, CardContent } from "../../ui/card";
import { JobCard } from "./job-card";
import {
    getAddress,
    getJobTiming,
    getPrimaryAction,
    groupJobs,
    JOB_GROUP_LABELS,
    PRIORITY_BADGE,
    type TechnicianJob,
} from "./types";
import type { useJobProgress } from "./use-job-progress";
import { useJobForms } from "./use-forms";
import { TodaysRouteCard } from "./todays-route-card";
import { DoneTodaySection } from "./done-today-section";
import { googleMapsLink, wazeLink } from "../../../lib/maps-link";

interface TechnicianHomeProps {
    name: string;
    jobs: TechnicianJob[];
    nextJob: TechnicianJob;
    onOpenJob: (jobId: string) => void;
    statusMutation: ReturnType<typeof useJobProgress>["statusMutation"];
    canCompleteNext: boolean;
}

/** Mobile field home: compact header, an "Up next" hero with inline actions,
 *  today's route, and the jobs grouped Overdue / Today / Upcoming, time-sorted. */
export function TechnicianHome({
    name,
    jobs,
    nextJob,
    onOpenJob,
    statusMutation,
    canCompleteNext,
}: TechnicianHomeProps) {
    // The hero already shows this job in full, directly above the list — repeating
    // it as the first card read as a duplicate assignment.
    const sections = groupJobs(jobs.filter((job) => job.id !== nextJob.id));
    // A technician's day is today. Everything further out is collapsed so the
    // screen opens on what they are actually driving to, not a wall of next week.
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const UPCOMING_PREVIEW = 3;
    // Rural plots/farms don't geocode, so navigate to the property's real
    // coordinates when we have them and fall back to the address text otherwise.
    const navDest = {
        lat: nextJob.property.geoLat,
        lng: nextJob.property.geoLng,
        address: getAddress(nextJob),
    };
    const googleHref = googleMapsLink(navDest);
    const wazeHref = wazeLink(navDest);
    const phoneHref = nextJob.customer.phone ? `tel:${nextJob.customer.phone}` : null;
    // Keep the hero "Complete job" gate consistent with the job screen: a required
    // compliance form blocks completion too. Cached, so no duplicate fetch.
    const { requiredPending: nextJobFormsPending } = useJobForms(nextJob.id);
    const primary = getPrimaryAction(nextJob);
    const primaryDisabled =
        primary?.nextStatus === "COMPLETED" && (!canCompleteNext || nextJobFormsPending);
    const priority = PRIORITY_BADGE[nextJob.priority];

    return (
        <div className="space-y-5 pb-4">
            {/* Compact header */}
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight">Hi {name}</h2>
                <span className="text-sm text-muted-foreground">{format(new Date(), "EEE, MMM d")}</span>
            </div>

            {/* Up next hero */}
            <Card className="overflow-hidden border-l-4 border-l-blue-500">
                <CardContent className="space-y-4 p-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Up next</div>
                        <button
                            type="button"
                            onClick={() => onOpenJob(nextJob.id)}
                            className="mt-1 w-full text-left"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                {priority && (
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${priority.className}`}
                                    >
                                        {priority.label}
                                    </span>
                                )}
                                <span className="text-lg font-semibold">{nextJob.title}</span>
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">{nextJob.customer.name}</div>
                        </button>
                    </div>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span>{getJobTiming(nextJob)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{getAddress(nextJob)}</span>
                        </div>
                    </div>

                    {primary && (
                        <button
                            type="button"
                            // A paused (offline) status change is already applied optimistically,
                            // so only a genuinely in-flight request should disable the button.
                            disabled={primaryDisabled || (statusMutation.isPending && !statusMutation.isPaused)}
                            onClick={() => statusMutation.mutate({ jobId: nextJob.id, status: primary.nextStatus })}
                            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                        >
                            {primary.label}
                        </button>
                    )}

                    {/* Navigation: Google Maps (primary) + Waze (secondary) side by
                        side — both deep-link straight into turn-by-turn. Call sits on
                        its own row so three actions stay tidy at 375px. */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <a
                                href={googleHref}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground active:scale-[0.98]"
                            >
                                <Navigation className="h-4 w-4" />
                                Google Maps
                            </a>
                            <a
                                href={wazeHref}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold active:scale-[0.98]"
                            >
                                <Navigation className="h-4 w-4" />
                                Waze
                            </a>
                        </div>
                        {phoneHref ? (
                            <a
                                href={phoneHref}
                                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold active:scale-[0.98]"
                            >
                                <Phone className="h-4 w-4" />
                                Call
                            </a>
                        ) : (
                            <span className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 text-sm font-semibold text-muted-foreground">
                                <Phone className="h-4 w-4" />
                                No phone
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Suggested visiting order for today (renders nothing without stops) */}
            <TodaysRouteCard jobs={jobs} onOpenJob={onOpenJob} />

            {/* Grouped job list */}
            {sections.map(({ group, jobs: groupJobsList }) => {
                const collapsed = group === "upcoming" && !showAllUpcoming;
                const visible = collapsed ? groupJobsList.slice(0, UPCOMING_PREVIEW) : groupJobsList;
                const hiddenCount = groupJobsList.length - visible.length;

                return (
                    <div key={group} className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                            <span
                                className={`text-xs font-bold uppercase tracking-wide ${
                                    group === "overdue" ? "text-red-600" : "text-muted-foreground"
                                }`}
                            >
                                {JOB_GROUP_LABELS[group]}
                            </span>
                            <span className="text-xs text-muted-foreground">{groupJobsList.length}</span>
                        </div>
                        <div className="space-y-2">
                            {visible.map((job) => (
                                <JobCard key={job.id} job={job} onSelect={onOpenJob} />
                            ))}
                        </div>
                        {group === "upcoming" && groupJobsList.length > UPCOMING_PREVIEW && (
                            <button
                                type="button"
                                onClick={() => setShowAllUpcoming((v) => !v)}
                                className="flex min-h-[48px] w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-muted-foreground active:scale-[0.99]"
                            >
                                {collapsed ? `Show ${hiddenCount} more` : "Show less"}
                                <ChevronDown
                                    className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
                                />
                            </button>
                        )}
                    </div>
                );
            })}

            {/* Finished today — collapsed, so the tech can reopen a job to send the
                pay link/summary or add after-photos without it crowding the list. */}
            <DoneTodaySection jobs={jobs} onOpenJob={onOpenJob} />
        </div>
    );
}
