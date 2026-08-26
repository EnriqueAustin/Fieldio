'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Clock, Square, Car, Coffee, FileText,
    Wrench, Loader2, Trash2, Calendar, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow
} from '@/components/ui/table';
import { cn, displayName } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { MyHours } from './my-hours';

type TimeEntryType = 'TRAVEL' | 'WRENCH' | 'ADMIN' | 'BREAK';
type TimeEntry = {
    id: string;
    type: TimeEntryType;
    startTime: string;
    endTime?: string;
    duration?: number;
    description?: string;
    user?: { id: string; firstName?: string | null; lastName?: string | null; email: string };
    job?: { id?: string; title: string };
};

const TYPE_CONFIG: Record<TimeEntryType, { label: string; icon: any; color: string; bg: string }> = {
    TRAVEL: { label: 'Travel', icon: Car,      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
    WRENCH: { label: 'On site', icon: Wrench,  color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
    ADMIN:  { label: 'Admin',  icon: FileText, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
    BREAK:  { label: 'Break',  icon: Coffee,   color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
};

function formatDuration(seconds?: number) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function LiveTimer({ startTime }: { startTime: string }) {
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => clearInterval(intervalRef.current);
    }, [startTime]);

    return (
        <span className="font-mono font-bold tabular-nums text-green-600">
            {formatDuration(elapsed)}
        </span>
    );
}

export default function TimeTrackingPage() {
    const { user } = useAuthStore();

    // Technicians don't log hours — job status does. They get the read-only
    // derived view; the office gets the review-and-correct table.
    if (user?.role === 'TECHNICIAN') return <MyHours />;

    return <OfficeTimesheet />;
}

/**
 * The office view: every technician's derived hours, with the ability to correct
 * them. There is no "start a timer" control — hours are produced by job status
 * transitions, so the only manual actions are stopping a clock that was left
 * running and deleting an entry that shouldn't exist.
 */
function OfficeTimesheet() {
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['time-entries'],
        queryFn: () => api.get('/time-tracking?limit=100').then(r => r.data.data),
        refetchInterval: 30000,
    });

    const entries: TimeEntry[] = data?.entries ?? [];
    const running = entries.filter(e => !e.endTime);

    const stopEntry = useMutation({
        mutationFn: (id: string) => api.post(`/time-tracking/${id}/stop`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const deleteEntry = useMutation({
        mutationFn: (id: string) => api.delete(`/time-tracking/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const todaySeconds = entries
        .filter(e => new Date(e.startTime).toDateString() === new Date().toDateString())
        .reduce((acc, e) => acc + (e.duration ?? 0), 0);

    return (
        <div className="space-y-5 md:space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-3xl">
                        <Clock className="h-6 w-6 text-primary md:h-8 md:w-8" />
                        Labour hours
                    </h2>
                    <p className="mt-1 hidden text-muted-foreground md:block">
                        Recorded automatically from job status. Correct anything that looks wrong.
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Logged today</p>
                    <p className="font-mono text-2xl font-bold tabular-nums">{formatDuration(todaySeconds)}</p>
                </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Technicians don&apos;t fill in timesheets. Travel starts when they head to a job and
                on-site time starts when they arrive; both stop when the job is done.
            </p>

            {/* Clocks running right now — the thing an office actually watches. */}
            {running.length > 0 && (
                <Card className="border-green-300 bg-green-50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-green-900">
                            On the clock now ({running.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {running.map(entry => {
                            const cfg = TYPE_CONFIG[entry.type];
                            const Icon = cfg.icon;
                            return (
                                <div
                                    key={entry.id}
                                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
                                            <span className="truncate text-sm font-medium">
                                                {displayName(entry.user, 'Unknown')}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {cfg.label}{entry.job?.title ? ` · ${entry.job.title}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <LiveTimer startTime={entry.startTime} />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => stopEntry.mutate(entry.id)}
                                            disabled={stopEntry.isPending}
                                        >
                                            <Square className="mr-1 h-3 w-3" /> Stop
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base md:text-lg">Timesheet</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Recent entries across the team
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex h-24 items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading entries...
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex h-24 flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Clock className="h-7 w-7 opacity-40" />
                            <p className="text-sm">No hours recorded yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Technician</TableHead>
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
                                            <TableRow key={entry.id} id={`entry-row-${entry.id}`}>
                                                <TableCell className="text-sm font-medium">
                                                    {displayName(entry.user, '—')}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn('gap-1', cfg.bg, cfg.color)}>
                                                        <Icon className="h-3 w-3" />
                                                        {cfg.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-sm">
                                                    {new Date(entry.startTime).toLocaleString('en-ZA', {
                                                        day: '2-digit', month: 'short',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-sm">
                                                    {entry.endTime
                                                        ? new Date(entry.endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
                                                        : <LiveTimer startTime={entry.startTime} />
                                                    }
                                                </TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {formatDuration(entry.duration)}
                                                </TableCell>
                                                <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                                                    {entry.job?.title ?? '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Delete entry"
                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                        disabled={deleteEntry.isPending}
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
