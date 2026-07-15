"use client";

/**
 * Tiny horizontal bar used inside table cells on the tech scoreboard.
 * Renders a value proportional to `max` with an accessible label.
 */
export function MiniBar({
    value,
    max,
    color = "#2563eb",
    label,
}: {
    value: number;
    max: number;
    color?: string;
    label?: string;
}) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="h-2 w-full min-w-[48px] rounded-full bg-slate-100" role="img" aria-label={label ?? `${value}`}>
            <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%`, backgroundColor: color }}
            />
        </div>
    );
}
