'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Car, Wrench, Loader2, Briefcase, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type JobBreakdown = { jobId: string | null; title: string; travel: number; onSite: number };
type Summary = {
    today: { total: number; travel: number; onSite: number; other: number; jobs: JobBreakdown[] };
    week: { total: number; travel: number; onSite: number; other: number; start: string };
    active: { id: string; type: string; startTime: string; job: { id: string; title: string } | null } | null;
};

/** "6h 42m" — hours are read at a glance, seconds are noise. */
function formatHours(seconds: number) {
    if (!seconds) return '0h 00m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function useElapsed(startTime: string) {
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => clearInterval(intervalRef.current);
    }, [startTime]);

    return elapsed;
}

const ACTIVE_COPY: Record<string, { label: string; icon: any; tint: string; border: string }> = {
    TRAVEL: { label: 'Driving to', icon: Car, tint: 'text-blue-700', border: 'border-blue-300 bg-blue-50' },
    WRENCH: { label: 'Working at', icon: Wrench, tint: 'text-green-700', border: 'border-green-300 bg-green-50' },
};

/**
 * A technician's hours, worked out by the system.
 *
 * There is deliberately nothing to press: the clock is driven by job status —
 * "Start route" begins travel, "Arrive on site" begins work, completing the job
 * stops it. This screen only reports what those actions recorded.
 */
export function MyHours() {
    const { data, isLoading } = useQuery<Summary>({
        queryKey: ['my-hours'],
        queryFn: () => api.get('/time-tracking/summary/me').then(r => r.data.data),
        refetchInterval: 60_000,
    });

    if (isLoading || !data) {
        return (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your hours...
            </div>
        );
    }

    const { today, week, active } = data;

    return (
        <div className="space-y-5">
            <div>
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-3xl">
                    <Clock className="h-6 w-6 text-primary md:h-8 md:w-8" />
                    My hours
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Counted automatically from your jobs — nothing to fill in.
                </p>
            </div>

            {active ? <ActiveClock active={active} /> : <IdleClock />}

            {/* Today / this week */}
            <div className="grid grid-cols-2 gap-3">
                <TotalCard label="Today" {...today} />
                <TotalCard label="This week" {...week} />
            </div>

            {/* Where today went */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Today by job</CardTitle>
                </CardHeader>
                <CardContent>
                    {today.jobs.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                            <Clock className="h-7 w-7 opacity-40" />
                            <p className="text-sm">No hours yet today.</p>
                            <p className="max-w-[24ch] text-xs">
                                Your clock starts when you tap “Start route” on a job.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {today.jobs.map(job => (
                                <div key={job.jobId ?? 'none'} className="rounded-xl border border-border p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-2">
                                            <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                            <span className="text-sm font-medium leading-snug">{job.title}</span>
                                        </div>
                                        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                                            {formatHours(job.travel + job.onSite)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-4 pl-6 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Car className="h-3.5 w-3.5" /> {formatHours(job.travel)}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Wrench className="h-3.5 w-3.5" /> {formatHours(job.onSite)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Hours come from your job status. If something looks wrong, the office can correct it.
            </p>
        </div>
    );
}

function ActiveClock({ active }: { active: NonNullable<Summary['active']> }) {
    const elapsed = useElapsed(active.startTime);
    const copy = ACTIVE_COPY[active.type] ?? {
        label: 'Clocked on',
        icon: Clock,
        tint: 'text-slate-700',
        border: 'border-slate-300 bg-slate-50',
    };
    const Icon = copy.icon;

    return (
        <Card className={cn('border-2', copy.border)}>
            <CardContent className="space-y-2 p-5 text-center">
                <div className="flex items-center justify-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                    <Icon className={cn('h-4 w-4', copy.tint)} />
                    <span className={cn('text-sm font-semibold', copy.tint)}>
                        {copy.label} {active.job?.title ?? 'a job'}
                    </span>
                </div>
                <div className="font-mono text-4xl font-bold tabular-nums tracking-tight">
                    {formatHours(elapsed)}
                </div>
                <p className="text-xs text-muted-foreground">
                    Since {new Date(active.startTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                </p>
            </CardContent>
        </Card>
    );
}

function IdleClock() {
    return (
        <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-1.5 p-5 text-center">
                <Clock className="h-6 w-6 text-slate-300" />
                <p className="text-sm font-medium">Clock is off</p>
                <p className="max-w-[30ch] text-xs text-muted-foreground">
                    It starts on its own when you head to your next job.
                </p>
            </CardContent>
        </Card>
    );
}

/** Total for a period, with the travel/on-site split underneath. */
function TotalCard({
    label,
    total,
    travel,
    onSite,
    other,
}: {
    label: string;
    total: number;
    travel: number;
    onSite: number;
    other: number;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{formatHours(total)}</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5" /> {formatHours(travel)} travel
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5" /> {formatHours(onSite)} on site
                    </span>
                    {other > 0 && (
                        <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> {formatHours(other)} other
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
