"use client";

type DispatchPoint = {
    id: string;
    label: string;
    lat: number;
    lng: number;
    tone: "tech" | "job";
};

function normalizePoint(
    point: DispatchPoint,
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
) {
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.01);
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.01);
    const x = ((point.lng - bounds.minLng) / lngSpan) * 100;
    const y = 100 - ((point.lat - bounds.minLat) / latSpan) * 100;
    return { x, y };
}

export function DispatchMap({
    techPoints,
    jobPoints,
}: {
    techPoints: DispatchPoint[];
    jobPoints: DispatchPoint[];
}) {
    const points = [...techPoints, ...jobPoints];

    if (points.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-slate-50/70 px-6 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No live coordinates yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Technician pings and geocoded properties will appear here for dispatch.
                </p>
            </div>
        );
    }

    const bounds = points.reduce(
        (acc, point) => ({
            minLat: Math.min(acc.minLat, point.lat),
            maxLat: Math.max(acc.maxLat, point.lat),
            minLng: Math.min(acc.minLng, point.lng),
            maxLng: Math.max(acc.maxLng, point.lng),
        }),
        {
            minLat: points[0].lat,
            maxLat: points[0].lat,
            minLng: points[0].lng,
            maxLng: points[0].lng,
        }
    );

    return (
        <div className="rounded-2xl border border-border bg-[radial-gradient(circle_at_top,#eff6ff,transparent_40%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3">
            <svg viewBox="0 0 100 100" className="aspect-[4/3] w-full overflow-visible rounded-xl">
                <defs>
                    <pattern id="dispatch-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.5" />
                    </pattern>
                </defs>
                <rect x="0" y="0" width="100" height="100" rx="6" fill="url(#dispatch-grid)" />

                {jobPoints.map((point) => {
                    const source = techPoints[0];
                    const p = normalizePoint(point, bounds);
                    const from = source ? normalizePoint(source, bounds) : null;
                    return (
                        <g key={point.id}>
                            {from ? (
                                <line
                                    x1={from.x}
                                    y1={from.y}
                                    x2={p.x}
                                    y2={p.y}
                                    stroke="rgba(148,163,184,0.45)"
                                    strokeDasharray="1.5 1.5"
                                />
                            ) : null}
                            <circle cx={p.x} cy={p.y} r="2.8" fill="#f59e0b" />
                            <circle cx={p.x} cy={p.y} r="5.2" fill="rgba(245,158,11,0.12)" />
                        </g>
                    );
                })}

                {techPoints.map((point) => {
                    const p = normalizePoint(point, bounds);
                    return (
                        <g key={point.id}>
                            <circle cx={p.x} cy={p.y} r="3.2" fill="#2563eb" />
                            <circle cx={p.x} cy={p.y} r="6.4" fill="rgba(37,99,235,0.14)" />
                            <text
                                x={p.x}
                                y={Math.max(p.y - 4.8, 6)}
                                textAnchor="middle"
                                fontSize="3"
                                fill="#0f172a"
                                fontWeight="600"
                            >
                                {point.label.slice(0, 10)}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 ring-1 ring-border">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    Technician
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 ring-1 ring-border">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Active job destination
                </span>
            </div>
        </div>
    );
}
