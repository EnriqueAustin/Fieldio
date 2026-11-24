"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Car, ExternalLink, MapPinOff, Route, X } from "lucide-react";
import api from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatusPill } from "../ui/status-pill";
import type { DayRoute } from "../dashboard/technician/types";

const fmtTime = (value: string | null) => (value ? format(new Date(value), "HH:mm") : null);

const fmtDrive = (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;

/**
 * A selected technician's suggested visiting order for one day, from
 * GET /schedule/my-route. Distances are straight-line and drive times are
 * estimates, so the panel says so.
 */
export function TechRoutePanel({
    techId,
    techName,
    date,
    onClose,
    onStopClick,
}: {
    techId: string;
    techName: string;
    date: Date;
    onClose: () => void;
    onStopClick?: (jobId: string) => void;
}) {
    const day = format(date, "yyyy-MM-dd");
    // Minutes east of UTC so the API cuts the day on local midnight.
    const tzOffset = -date.getTimezoneOffset();

    const { data: route, isLoading, isError, refetch } = useQuery<DayRoute | null>({
        queryKey: ["dispatch-tech-route", techId, day],
        queryFn: async () => {
            const res = await api.get("/schedule/my-route", { params: { date: day, techId, tzOffset } });
            return (res.data?.data?.route ?? null) as DayRoute | null;
        },
        staleTime: 60_000,
    });

    return (
        <Card>
            <CardHeader className="border-b border-border/70">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2">
                            <Route className="h-4 w-4 shrink-0" />
                            <span className="truncate">{techName}&apos;s route</span>
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{format(date, "EEE d MMM yyyy")}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Close route"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
                {isLoading && <p className="p-2 text-sm text-muted-foreground">Loading route…</p>}

                {isError && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <span>Could not load the route.</span>
                        <button type="button" onClick={() => void refetch()} className="text-xs font-medium hover:underline">
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !isError && (!route || route.stops.length === 0) && (
                    <p className="p-2 text-center text-sm italic text-muted-foreground">No jobs on this day.</p>
                )}

                {route && route.stops.length > 0 && (
                    <>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                                {route.totals.stops} stop{route.totals.stops !== 1 ? "s" : ""}
                            </span>
                            <span>≈ {route.totals.distanceKm} km</span>
                            <span>≈ {fmtDrive(route.totals.driveMinutes)} driving</span>
                        </div>

                        <ol className="space-y-1.5">
                            {route.stops.map((stop) => {
                                const start = fmtTime(stop.scheduledStart);
                                const end = fmtTime(stop.scheduledEnd);
                                return (
                                    <li key={stop.jobId}>
                                        {stop.leg && (
                                            <p className="flex items-center gap-1 pb-1 pl-8 text-[11px] text-muted-foreground">
                                                <Car className="h-3 w-3" />
                                                ≈ {fmtDrive(stop.leg.driveMinutes)} · {stop.leg.distanceKm} km
                                            </p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onStopClick?.(stop.jobId)}
                                            className="flex w-full items-start gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                                                {stop.order}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-sm font-medium">{stop.title}</span>
                                                    {start && (
                                                        <span className="shrink-0 text-xs text-muted-foreground">
                                                            {start}
                                                            {end ? `–${end}` : ""}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {[stop.customerName, stop.address].filter(Boolean).join(" · ") || "No details"}
                                                </span>
                                                <span className="mt-1 flex items-center gap-2">
                                                    <StatusPill status={stop.status} />
                                                    {stop.noLocation && (
                                                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                                                            <MapPinOff className="h-3 w-3" /> No location
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>

                        {route.mapsUrl && (
                            <a
                                href={route.mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                                Open in Google Maps
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                            Approximate: straight-line distances and estimated drive times.
                            {route.mapsTruncated && " Google Maps link shows the first stops only."}
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
