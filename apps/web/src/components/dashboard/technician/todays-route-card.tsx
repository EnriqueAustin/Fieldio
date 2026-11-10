"use client";

import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { Route, Navigation, MapPinOff } from "lucide-react";
import { Card, CardContent } from "../../ui/card";
import { STATUS_LABELS, STATUS_STYLES, type DayRouteStop, type TechnicianJob } from "./types";
import { useDayRoute } from "./use-day-route";

interface TodaysRouteCardProps {
    /** The tech's job list — used to drop finished stops instantly and to
     *  refetch the route when a status changes. */
    jobs: TechnicianJob[];
    onOpenJob: (jobId: string) => void;
}

const formatMinutes = (min: number) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
};

function stopTime(stop: DayRouteStop) {
    if (stop.kind === "inProgress") return null;
    if (stop.kind === "flexible" || !stop.scheduledStart) return "Any time";
    return format(new Date(stop.scheduledStart), "p");
}

/** Ordered stops for today with approximate leg distance/drive time and a single
 *  "Open route in Maps" hand-off. Renders nothing until there is a route. */
export function TodaysRouteCard({ jobs, onOpenJob }: TodaysRouteCardProps) {
    const { data: route, refetch } = useDayRoute();

    // Status changes (start route, complete) reshape the day — refetch then.
    const statusKey = useMemo(() => jobs.map((j) => `${j.id}:${j.status}`).join("|"), [jobs]);
    const lastKey = useRef(statusKey);
    useEffect(() => {
        if (lastKey.current === statusKey) return;
        lastKey.current = statusKey;
        void refetch();
    }, [statusKey, refetch]);

    const closed = useMemo(
        () => new Set(jobs.filter((j) => j.status === "COMPLETED" || j.status === "CANCELED").map((j) => j.id)),
        [jobs]
    );
    const stops = (route?.stops ?? []).filter((s) => !closed.has(s.jobId));
    if (!route || stops.length === 0) return null;

    const { distanceKm, driveMinutes } = route.totals;

    return (
        <Card data-testid="todays-route">
            <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Route className="h-4 w-4 shrink-0" />
                            Today&apos;s route
                        </div>
                        <div className="mt-1 text-sm">
                            <span className="font-semibold">
                                {stops.length} stop{stops.length === 1 ? "" : "s"}
                            </span>
                            {distanceKm > 0 && (
                                <span className="text-muted-foreground">
                                    {" "}
                                    · ~{distanceKm} km · ~{formatMinutes(driveMinutes)} driving
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <ol className="space-y-1">
                    {stops.map((stop, i) => {
                        const status = stop.status as TechnicianJob["status"];
                        const time = stopTime(stop);
                        return (
                            <li key={stop.jobId}>
                                <button
                                    type="button"
                                    onClick={() => onOpenJob(stop.jobId)}
                                    className="flex min-h-[48px] w-full items-start gap-3 rounded-xl px-1 py-2 text-left active:bg-slate-50"
                                >
                                    <span
                                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            stop.noLocation ? "bg-slate-100 text-slate-500" : "bg-blue-600 text-white"
                                        }`}
                                    >
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">{stop.title}</span>
                                            {time && (
                                                <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
                                            )}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {[stop.customerName, stop.address].filter(Boolean).join(" · ")}
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            {stop.kind === "inProgress" && STATUS_LABELS[status] && (
                                                <span
                                                    className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[status]}`}
                                                >
                                                    {STATUS_LABELS[status]}
                                                </span>
                                            )}
                                            {stop.noLocation ? (
                                                <span className="flex items-center gap-1 text-amber-700">
                                                    <MapPinOff className="h-3.5 w-3.5" />
                                                    No map location
                                                </span>
                                            ) : stop.leg ? (
                                                <span className="text-muted-foreground">
                                                    {stop.leg.distanceKm} km · ~{formatMinutes(stop.leg.driveMinutes)}
                                                </span>
                                            ) : null}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>

                {route.mapsUrl ? (
                    <a
                        href={route.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold active:scale-[0.98]"
                    >
                        <Navigation className="h-4 w-4" />
                        Open route in Maps
                    </a>
                ) : null}

                <p className="text-[11px] leading-snug text-muted-foreground">
                    Suggested order — fixed appointment times are kept. Distances are straight-line and drive
                    times approximate (~{route.estimate.avgSpeedKmh} km/h).
                    {route.mapsTruncated && " Maps shows the first 10 stops; reopen it after stop 10."}
                </p>
            </CardContent>
        </Card>
    );
}
