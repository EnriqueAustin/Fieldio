"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

export interface RangeValue {
    /** Preset window length in days (mutually exclusive with from/to). */
    days?: number;
    from?: string;
    to?: string;
}

const PRESETS = [
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
];

/**
 * Date-range control with 7/30/90-day presets plus a custom from/to range.
 * Emits a RangeValue the analytics endpoints understand (days OR from+to).
 */
export function DateRangePicker({
    value,
    onChange,
}: {
    value: RangeValue;
    onChange: (v: RangeValue) => void;
}) {
    const [custom, setCustom] = useState(false);
    const [from, setFrom] = useState(value.from ?? "");
    const [to, setTo] = useState(value.to ?? "");

    const applyCustom = () => {
        if (from && to) onChange({ from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
                <button
                    key={p.days}
                    onClick={() => {
                        setCustom(false);
                        onChange({ days: p.days });
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        !custom && value.days === p.days
                            ? "bg-slate-900 text-white"
                            : "bg-white border border-border text-muted-foreground hover:bg-slate-50"
                    }`}
                >
                    {p.label}
                </button>
            ))}
            <button
                onClick={() => setCustom((c) => !c)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    custom
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-border text-muted-foreground hover:bg-slate-50"
                }`}
            >
                <Calendar className="h-4 w-4" />
                Custom
            </button>
            {custom && (
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                    <button
                        onClick={applyCustom}
                        disabled={!from || !to}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-slate-800 transition"
                    >
                        Apply
                    </button>
                </div>
            )}
        </div>
    );
}

/** Build a query string for analytics endpoints from a RangeValue. */
export function rangeToQuery(v: RangeValue): string {
    if (v.from && v.to) return `from=${encodeURIComponent(v.from)}&to=${encodeURIComponent(v.to)}`;
    return `days=${v.days ?? 30}`;
}
