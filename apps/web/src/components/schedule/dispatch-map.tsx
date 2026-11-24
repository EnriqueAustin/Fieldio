"use client";

import dynamic from "next/dynamic";

export type DispatchPoint = {
    id: string;
    label: string;
    lat: number;
    lng: number;
    tone: "tech" | "job";
    // For job points: the id of the tech point this job is assigned to, so the
    // connecting line is drawn from the right technician (not always techPoints[0]).
    techPointId?: string;
};

// Leaflet touches `window` at import time, so the map itself is client-only.
const DispatchMapInner = dynamic(() => import("./dispatch-map-inner"), {
    ssr: false,
    loading: () => (
        <div
            className="flex h-[320px] items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground"
            role="status"
        >
            Loading map…
        </div>
    ),
});

export function DispatchMap({
    techPoints,
    jobPoints,
}: {
    techPoints: DispatchPoint[];
    jobPoints: DispatchPoint[];
}) {
    return (
        <div className="rounded-2xl border border-border bg-background p-3">
            <DispatchMapInner techPoints={techPoints} jobPoints={jobPoints} />

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 ring-1 ring-border">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    Technician
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 ring-1 ring-border">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Active job destination
                </span>
            </div>
        </div>
    );
}
