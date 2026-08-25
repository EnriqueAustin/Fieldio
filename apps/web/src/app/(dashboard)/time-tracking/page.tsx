'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Clock, Play, Square, Car, Coffee, FileText,
    Wrench, Loader2, Trash2, Calendar, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type TimeEntryType = 'TRAVEL' | 'WRENCH' | 'ADMIN' | 'BREAK';
type TimeEntry = {
    id: string;
    type: TimeEntryType;
    startTime: string;
    endTime?: string;
    duration?: number;
    description?: string;
    job?: { id?: string; title: string };
};

/** A job this technician is assigned, for attributing a timer to real work. */
type AssignedJob = { id: string; title: string; status: string; customer?: { name: string } | null };

const TYPE_CONFIG: Record<TimeEntryType, { label: string; icon: any; color: string; bg: string; ring: string }> = {
    TRAVEL: { label: 'Travel', icon: Car,     color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     ring: 'ring-blue-400' },
    WRENCH: { label: 'Work',   icon: Wrench,  color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   ring: 'ring-green-400' },
    ADMIN:  { label: 'Admin',  icon: FileText, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', ring: 'ring-purple-400' },
    BREAK:  { label: 'Break',  icon: Coffee,  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', ring: 'ring-orange-400' },
};

// Travel and wrench time is what job costing is built on, so those timers ask
// which job. Admin and break are company overhead and stay unattributed.
const JOB_ATTRIBUTED: TimeEntryType[] = ['TRAVEL', 'WRENCH'];

function formatDuration(seconds?: number) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/** Zero-padded H:MM:SS — the big readout on the running-timer card. */
function formatClock(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useElapsed(startTime: string) {
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => clearInterval(intervalRef.current);
    }, [startTime]);

    return elapsed;
}

function LiveTimer({ startTime }: { startTime: string }) {
    const elapsed = useElapsed(startTime);
    return (
        <span className="font-mono font-bold text-green-600 tabular-nums">
            {formatDuration(elapsed)}
        </span>
    );
}

export default function TimeTrackingPage() {
    const qc = useQueryClient();
    // Which job the next timer gets attributed to. Seeded from whatever job the
    // tech is actually on so the common case needs no interaction.
    const [jobId, setJobId] = useState<string>('');

    const { data, isLoading } = useQuery({
        queryKey: ['time-entries'],
        queryFn: () => api.get('/time-tracking').then(r => r.data.data),
        refetchInterval: 30000,
    });

    // Assigned jobs drive the attribution picker. Technician-scoped endpoint, so
    // office roles simply get an empty list and the picker hides itself.
    const { data: assignedJobs = [] } = useQuery<AssignedJob[]>({
        queryKey: ['time-tracking-assigned-jobs'],
        queryFn: () => api.get('/jobs/assigned/me').then(r => r.data?.data?.jobs ?? []),
        retry: false,
    });

    const entries: TimeEntry[] = data?.entries ?? [];
    const activeEntry = entries.find(e => !e.endTime);

    const suggestedJob = useMemo(
        () =>
            assignedJobs.find(j => j.status === 'ON_SITE') ??
            assignedJobs.find(j => j.status === 'EN_ROUTE') ??
            assignedJobs.find(j => j.status === 'ASSIGNED') ??
            null,
        [assignedJobs]
    );

    useEffect(() => {
        if (!jobId && suggestedJob) setJobId(suggestedJob.id);
    }, [jobId, suggestedJob]);

    const startEntry = useMutation({
        mutationFn: (type: TimeEntryType) =>
            api.post('/time-tracking/start', {
                type,
                ...(JOB_ATTRIBUTED.includes(type) && jobId ? { jobId } : {}),
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const stopEntry = useMutation({
        mutationFn: (id: string) => api.post(`/time-tracking/${id}/stop`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const deleteEntry = useMutation({
        mutationFn: (id: string) => api.delete(`/time-tracking/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const todayEntries = entries.filter(e => {
        const today = new Date();
        return new Date(e.startTime).toDateString() === today.toDateString();
    });
    const totalTodaySeconds = todayEntries.reduce((acc, e) => acc + (e.duration ?? 0), 0);

    return (
        <div className="space-y-5 md:space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-3xl">
                        <Clock className="h-6 w-6 text-primary md:h-8 md:w-8" />
                        Time
                    </h2>
                    <p className="mt-1 hidden text-muted-foreground md:block">
                        Track travel, work, admin, and breaks for accurate job costing.
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Today</p>
                    <p className="font-mono text-2xl font-bold tabular-nums">{formatDuration(totalTodaySeconds)}</p>
                </div>
            </div>

            {/* Running timer — the whole point of the screen when a clock is going. */}
            {activeEntry ? (
                <RunningTimerCard
                    entry={activeEntry}
                    onStop={() => stopEntry.mutate(activeEntry.id)}
                    stopping={stopEntry.isPending}
                />
            ) : (
                <>
                    {/* Attribute the next travel/work timer to a job. */}
                    {assignedJobs.length > 0 && (
                        <div className="space-y-1.5">
                            <label
                                htmlFor="time-job"
                                className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                                <Briefcase className="h-3.5 w-3.5" />
                                Bill travel &amp; work to
                            </label>
                            <select
                                id="time-job"
                                value={jobId}
                                onChange={e => setJobId(e.target.value)}
                                className="min-h-[48px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                            >
                                <option value="">No job (unbilled)</option>
                                {assignedJobs.map(job => (
                                    <option key={job.id} value={job.id}>
                                        {job.title}
                                        {job.customer?.name ? ` — ${job.customer.name}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Clock-in buttons. Full-size tap targets, two-up on a phone. */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {(Object.keys(TYPE_CONFIG) as TimeEntryType[]).map((type) => {
                            const cfg = TYPE_CONFIG[type];
                            const Icon = cfg.icon;
                            const pending = startEntry.isPending && startEntry.variables === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    id={`start-${type.toLowerCase()}-btn`}
                                    disabled={startEntry.isPending}
                                    onClick={() => startEntry.mutate(type)}
                                    className={cn(
                                        'flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border text-center transition active:scale-[0.98] disabled:opacity-60',
                                        cfg.bg
                                    )}
                                >
                                    {pending
                                        ? <Loader2 className={cn('h-7 w-7 animate-spin', cfg.color)} />
                                        : <Icon className={cn('h-7 w-7', cfg.color)} />}
                                    <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                        <Play className="h-3 w-3" /> Start
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Timesheet */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-base md:text-lg">My timesheet</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Recent time entries
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex h-24 items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading entries...
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex h-24 flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Clock className="h-7 w-7 opacity-40" />
                            <p className="text-sm">No time entries yet. Start a timer above.</p>
                        </div>
                    ) : (
                        <>
                            {/* Phone: stacked cards. A six-column table cannot be read at 375px. */}
                            <div className="space-y-2 md:hidden">
                                {entries.map(entry => {
                                    const cfg = TYPE_CONFIG[entry.type];
                                    const Icon = cfg.icon;
                                    return (
                                        <div
                                            key={entry.id}
                                            id={`entry-row-${entry.id}`}
                                            className="rounded-xl border border-border p-3"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold', cfg.bg, cfg.color)}>
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {cfg.label}
                                                </span>
                                                <span className="font-mono text-sm font-semibold tabular-nums">
                                                    {entry.endTime
                                                        ? formatDuration(entry.duration)
                                                        : <LiveTimer startTime={entry.startTime} />}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                                <span>
                                                    {new Date(entry.startTime).toLocaleString('en-ZA', {
                                                        day: '2-digit', month: 'short',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                    {entry.endTime && ` – ${new Date(entry.endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`}
                                                </span>
                                                {entry.endTime && (
                                                    <button
                                                        type="button"
                                                        aria-label="Delete entry"
                                                        disabled={deleteEntry.isPending}
                                                        onClick={() => deleteEntry.mutate(entry.id)}
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-destructive active:scale-95"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                            {entry.job?.title && (
                                                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{entry.job.title}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Start</TableHead>
                                            <TableHead>End</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Job</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entries.map(entry => {
                                            const cfg = TYPE_CONFIG[entry.type];
                                            const Icon = cfg.icon;
                                            return (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        <Badge variant="outline" className={cn('gap-1', cfg.bg, cfg.color)}>
                                                            <Icon className="h-3 w-3" />
                                                            {cfg.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {new Date(entry.startTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {entry.endTime
                                                            ? new Date(entry.endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
                                                            : <LiveTimer startTime={entry.startTime} />
                                                        }
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm">
                                                        {formatDuration(entry.duration)}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {entry.job?.title ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                                            disabled={!entry.endTime || deleteEntry.isPending}
                                                            onClick={() => deleteEntry.mutate(entry.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/** The running clock: large readout, one unmistakable Stop control. */
function RunningTimerCard({
    entry,
    onStop,
    stopping,
}: {
    entry: TimeEntry;
    onStop: () => void;
    stopping: boolean;
}) {
    const elapsed = useElapsed(entry.startTime);
    const cfg = TYPE_CONFIG[entry.type];
    const Icon = cfg.icon;

    return (
        <Card className={cn('border-2', cfg.bg)}>
            <CardContent className="space-y-4 p-5 text-center">
                <div className="flex items-center justify-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                    <Icon className={cn('h-4 w-4', cfg.color)} />
                    <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label} in progress</span>
                </div>

                <div className="font-mono text-5xl font-bold tabular-nums tracking-tight">
                    {formatClock(elapsed)}
                </div>

                <p className="text-xs text-muted-foreground">
                    Started {new Date(entry.startTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                    {entry.job?.title ? ` · ${entry.job.title}` : ''}
                </p>

                <button
                    type="button"
                    id="stop-timer-btn"
                    onClick={onStop}
                    disabled={stopping}
                    className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
                >
                    {stopping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5 fill-current" />}
                    Stop
                </button>
            </CardContent>
        </Card>
    );
}
