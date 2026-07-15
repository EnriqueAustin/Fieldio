"use client";

import Link from "next/link";

export interface FunnelStage {
    label: string;
    count: number;
    value: number;
    color: string;
    href?: string;
}

/**
 * Quote funnel (sent -> approved -> converted) as horizontal proportional bars
 * with counts and ZAR value. Stages can link into the estimates page.
 */
export function FunnelChart({
    stages,
    formatValue,
    title,
}: {
    stages: FunnelStage[];
    formatValue: (n: number) => string;
    title?: string;
}) {
    const max = Math.max(1, ...stages.map((s) => s.count));

    return (
        <div className="space-y-2" role="img" aria-label={title ?? "Quote funnel"}>
            {stages.map((s, i) => {
                const pct = Math.round((s.count / max) * 100);
                const convPct = i > 0 && stages[i - 1].count > 0
                    ? Math.round((s.count / stages[i - 1].count) * 100)
                    : null;
                const body = (
                    <div className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-slate-600">
                                {s.label}
                                {convPct !== null && (
                                    <span className="ml-2 text-slate-400">{convPct}% of prev</span>
                                )}
                            </span>
                            <span className="text-slate-500">
                                <span className="font-semibold text-slate-700">{s.count}</span> · {formatValue(s.value)}
                            </span>
                        </div>
                        <div className="h-7 w-full rounded-md bg-slate-100 overflow-hidden">
                            <div
                                className="h-full rounded-md transition-all group-hover:opacity-90"
                                style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: s.color }}
                            />
                        </div>
                    </div>
                );
                return s.href ? (
                    <Link key={s.label} href={s.href} className="block">
                        {body}
                    </Link>
                ) : (
                    <div key={s.label}>{body}</div>
                );
            })}
        </div>
    );
}
