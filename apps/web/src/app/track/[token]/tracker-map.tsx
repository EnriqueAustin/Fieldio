"use client";

import dynamic from "next/dynamic";

export interface TrackerMapProps {
    tech: { lat: number; lng: number; label: string };
    home: { lat: number; lng: number } | null;
}

// Leaflet touches `window` at import time, so the map itself is client-only.
const TrackerMapInner = dynamic(() => import("./tracker-map-inner"), {
    ssr: false,
    loading: () => (
        <div className="flex h-64 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500 sm:h-80" role="status">
            Loading map…
        </div>
    ),
});

export function TrackerMap(props: TrackerMapProps) {
    return <TrackerMapInner {...props} />;
}
