"use client";

export interface LineAreaPoint {
    label: string;
    value: number;
}

/**
 * Small responsive area+line chart drawn with inline SVG (no chart lib).
 * Scales via viewBox; colours come from the Tailwind slate/emerald palette.
 */
export function LineAreaChart({
    data,
    height = 200,
    formatValue = (n) => String(n),
    stroke = "#059669",
    fill = "#05966922",
    title,
}: {
    data: LineAreaPoint[];
    height?: number;
    formatValue?: (n: number) => string;
    stroke?: string;
    fill?: string;
    title?: string;
}) {
    const width = 640;
    const padX = 44;
    const padY = 16;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2 - 18; // leave room for x labels

    if (data.length === 0) {
        return <EmptyChart height={height} />;
    }

    const max = Math.max(1, ...data.map((d) => d.value));
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const x = (i: number) => padX + (data.length > 1 ? i * stepX : innerW / 2);
    const y = (v: number) => padY + innerH - (v / max) * innerH;

    const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${x(data.length - 1).toFixed(1)},${(padY + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padY + innerH).toFixed(1)} Z`;

    const gridLines = [0, 0.5, 1];

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            role="img"
            aria-label={title ?? "Trend chart"}
            className="overflow-visible"
        >
            {title && <title>{title}</title>}
            {gridLines.map((g) => {
                const gy = padY + innerH - g * innerH;
                return (
                    <g key={g}>
                        <line x1={padX} x2={width - padX} y1={gy} y2={gy} stroke="#e2e8f0" strokeWidth={1} />
                        <text x={padX - 8} y={gy + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>
                            {formatValue(max * g)}
                        </text>
                    </g>
                );
            })}
            <path d={areaPath} fill={fill} />
            <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
                <g key={i}>
                    <circle cx={x(i)} cy={y(d.value)} r={2.5} fill={stroke} />
                    {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0) && (
                        <text x={x(i)} y={height - 4} textAnchor="middle" className="fill-slate-400" fontSize={10}>
                            {d.label}
                        </text>
                    )}
                </g>
            ))}
        </svg>
    );
}

function EmptyChart({ height }: { height: number }) {
    return (
        <div
            className="flex items-center justify-center text-xs text-slate-400"
            style={{ height }}
        >
            No data for this period.
        </div>
    );
}
