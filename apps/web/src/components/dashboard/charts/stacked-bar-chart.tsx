"use client";

export interface StackedSeries {
    key: string;
    label: string;
    color: string;
}

export interface StackedBarDatum {
    label: string;
    values: Record<string, number>;
}

/**
 * Responsive stacked bar chart (inline SVG). Used for jobs-by-status over time.
 */
export function StackedBarChart({
    data,
    series,
    height = 220,
    title,
}: {
    data: StackedBarDatum[];
    series: StackedSeries[];
    height?: number;
    title?: string;
}) {
    const width = 640;
    const padX = 32;
    const padY = 12;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2 - 18;

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
                No data for this period.
            </div>
        );
    }

    const totals = data.map((d) => series.reduce((s, ser) => s + (d.values[ser.key] ?? 0), 0));
    const max = Math.max(1, ...totals);
    const slot = innerW / data.length;
    const barW = Math.min(36, slot * 0.6);

    return (
        <div>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={title ?? "Stacked bar chart"}>
                {title && <title>{title}</title>}
                {[0, 0.5, 1].map((g) => {
                    const gy = padY + innerH - g * innerH;
                    return <line key={g} x1={padX} x2={width - padX} y1={gy} y2={gy} stroke="#e2e8f0" strokeWidth={1} />;
                })}
                {data.map((d, i) => {
                    const cx = padX + slot * i + slot / 2;
                    let acc = 0;
                    return (
                        <g key={i}>
                            {series.map((ser) => {
                                const v = d.values[ser.key] ?? 0;
                                if (v <= 0) return null;
                                const h = (v / max) * innerH;
                                const yTop = padY + innerH - acc - h;
                                acc += h;
                                return (
                                    <rect
                                        key={ser.key}
                                        x={cx - barW / 2}
                                        y={yTop}
                                        width={barW}
                                        height={h}
                                        fill={ser.color}
                                        rx={1.5}
                                    >
                                        <title>{`${ser.label}: ${v}`}</title>
                                    </rect>
                                );
                            })}
                            {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && (
                                <text x={cx} y={height - 4} textAnchor="middle" className="fill-slate-400" fontSize={10}>
                                    {d.label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
            <div className="mt-2 flex flex-wrap gap-3">
                {series.map((ser) => (
                    <span key={ser.key} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ser.color }} />
                        {ser.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
