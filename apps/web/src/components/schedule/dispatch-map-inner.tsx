"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { latLngBounds, type LatLngTuple } from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { DispatchPoint } from "./dispatch-map";

const JOHANNESBURG: LatLngTuple = [-26.2041, 28.0473];
const TECH_COLOUR = "#2563eb";
const JOB_COLOUR = "#f59e0b";

// Refit only when the set of points changes (a tech appears, a job is added),
// not on every 30s position ping, so a dispatcher's pan/zoom isn't undone.
function FitToPoints({ points }: { points: DispatchPoint[] }) {
    const map = useMap();
    const idKey = useMemo(
        () => points.map((p) => `${p.tone}:${p.id}`).sort().join("|"),
        [points]
    );

    useEffect(() => {
        if (points.length === 0) return;
        const bounds = latLngBounds(points.map((p) => [p.lat, p.lng] as LatLngTuple));
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
        // Positions are intentionally read from the latest render only when ids change.
    }, [idKey, map]);

    return null;
}

export default function DispatchMapInner({
    techPoints,
    jobPoints,
}: {
    techPoints: DispatchPoint[];
    jobPoints: DispatchPoint[];
}) {
    const validTechs = techPoints.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const validJobs = jobPoints.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const allPoints = [...validTechs, ...validJobs];
    const techById = new Map(validTechs.map((t) => [t.id, t]));

    return (
        <div className="relative isolate h-[320px] overflow-hidden rounded-xl" role="region" aria-label="Dispatch map">
            <MapContainer
                center={JOHANNESBURG}
                zoom={10}
                scrollWheelZoom={false}
                className="h-full w-full"
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <FitToPoints points={allPoints} />

                {validJobs.map((job) => {
                    const tech = job.techPointId ? techById.get(job.techPointId) : undefined;
                    return tech ? (
                        <Polyline
                            key={`line-${job.id}`}
                            positions={[
                                [tech.lat, tech.lng],
                                [job.lat, job.lng],
                            ]}
                            pathOptions={{ color: "#64748b", weight: 2, opacity: 0.7, dashArray: "6 6" }}
                        />
                    ) : null;
                })}

                {validJobs.map((job) => (
                    <CircleMarker
                        key={`job-${job.id}`}
                        center={[job.lat, job.lng]}
                        radius={7}
                        pathOptions={{ color: JOB_COLOUR, fillColor: JOB_COLOUR, fillOpacity: 0.85, weight: 2 }}
                    >
                        <Tooltip direction="top" offset={[0, -6]}>
                            {job.label}
                        </Tooltip>
                    </CircleMarker>
                ))}

                {validTechs.map((tech) => (
                    <CircleMarker
                        key={`tech-${tech.id}`}
                        center={[tech.lat, tech.lng]}
                        radius={8}
                        pathOptions={{ color: "#ffffff", fillColor: TECH_COLOUR, fillOpacity: 1, weight: 2 }}
                    >
                        <Tooltip permanent direction="top" offset={[0, -8]}>
                            {tech.label}
                        </Tooltip>
                    </CircleMarker>
                ))}
            </MapContainer>

            {allPoints.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-3">
                    <p className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                        No live technician positions yet
                    </p>
                </div>
            ) : null}
        </div>
    );
}
