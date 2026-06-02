'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Clock, Play, Square, Car, Coffee, FileText,
    Wrench, Loader2, Trash2, Calendar
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
    job?: { title: string };
};

const TYPE_CONFIG: Record<TimeEntryType, { label: string; icon: any; color: string; bg: string }> = {
    TRAVEL: { label: 'Travel',   icon: Car,      color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
    WRENCH: { label: 'Work',     icon: Wrench,   color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
    ADMIN:  { label: 'Admin',    icon: FileText,  color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    BREAK:  { label: 'Break',    icon: Coffee,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
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
        const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => clearInterval(intervalRef.current);
    }, [startTime]);

    return (
        <span className="font-mono font-bold text-green-600 tabular-nums">
            {formatDuration(elapsed)}
        </span>
    );
}

export default function TimeTrackingPage() {
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['time-entries'],
        queryFn: () => api.get('/time-tracking').then(r => r.data.data),
        refetchInterval: 30000,
    });

    const entries: TimeEntry[] = data?.entries ?? [];
    const activeEntry = entries.find(e => !e.endTime);

    const startEntry = useMutation({
        mutationFn: (type: TimeEntryType) => api.post('/time-tracking/start', { type }),
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

    const totalTodaySeconds = entries
        .filter(e => {
            const today = new Date();
            const entryDate = new Date(e.startTime);
            return entryDate.toDateString() === today.toDateString();
        })
        .reduce((acc, e) => acc + (e.duration ?? 0), 0);

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Clock className="h-8 w-8 text-primary" />
                        Time Tracking
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Track travel, work, admin, and breaks for accurate job costing.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Today's total</p>
                    <p className="text-2xl font-bold font-mono">{formatDuration(totalTodaySeconds)}</p>
                </div>
            </div>

            {/* Active Timer Banner */}
            {activeEntry && (
                <Card className="border-green-300 bg-green-50">
                    <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                            <div>
                                <p className="font-semibold text-green-800">
                                    {TYPE_CONFIG[activeEntry.type].label} in progress
                                </p>
                                <p className="text-xs text-green-600">
                                    Started at {new Date(activeEntry.startTime).toLocaleTimeString('en-ZA')}
                                </p>
                            </div>
                            <LiveTimer startTime={activeEntry.startTime} />
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            id="stop-timer-btn"
                            onClick={() => stopEntry.mutate(activeEntry.id)}
                            disabled={stopEntry.isPending}
                        >
                            {stopEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}
                            Stop
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Clock-In Buttons */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(TYPE_CONFIG) as TimeEntryType[]).map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    const isRunning = activeEntry?.type === type;
                    return (
                        <Card
                            key={type}
                            className={cn('transition-all', cfg.bg, isRunning && 'ring-2 ring-green-400')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className={cn('text-sm font-medium', cfg.color)}>
                                    {cfg.label}
                                </CardTitle>
                                <Icon className={cn('h-4 w-4', cfg.color)} />
                            </CardHeader>
                            <CardContent className="pt-0">
                                {isRunning ? (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => stopEntry.mutate(activeEntry!.id)}
                                        disabled={stopEntry.isPending}
                                    >
                                        <Square className="mr-2 h-3 w-3" /> Stop
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        id={`start-${type.toLowerCase()}-btn`}
                                        className="w-full"
                                        disabled={!!activeEntry || startEntry.isPending}
                                        onClick={() => startEntry.mutate(type)}
                                    >
                                        {startEntry.isPending && startEntry.variables === type
                                            ? <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                            : <Play className="mr-2 h-3 w-3" />
                                        }
                                        Start
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Timesheet */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>My Timesheet</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" /> Recent time entries
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading entries...
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-24 text-muted-foreground gap-2">
                            <Clock className="h-7 w-7 opacity-40" />
                            <p className="text-sm">No time entries yet. Start a timer above!</p>
                        </div>
                    ) : (
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
                                        <TableRow key={entry.id} id={`entry-row-${entry.id}`}>
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
