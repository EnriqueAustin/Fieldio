'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Clock, Square, Car, Coffee, FileText,
    Wrench, Loader2, Trash2, Calendar, Info, Pencil, Plus, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
type TechTotal = { userId: string; name: string; email: string | null; totalSeconds: number; entryCount: number };
type TechOption = { id: string; firstName?: string | null; lastName?: string | null; email: string };
type JobOption = { id: string; title: string };

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

// API errors arrive as { response: { data: { message } } }; show the message.
function errMessage(e: any): string {
    return e?.response?.data?.message || e?.message || 'Something went wrong. Please try again.';
}

// ISO string -> value for an <input type="datetime-local"> in the browser's zone.
function toLocalInput(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local value -> ISO (UTC) for the API (z.string().datetime()).
function localInputToIso(value: string): string {
    return new Date(value).toISOString();
}

// Monday / Sunday of the current week, as YYYY-MM-DD for the date pickers.
function thisWeekRange(): { from: string; to: string } {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    return { from: fmt(monday), to: fmt(sunday) };
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
 * The office view: every technician's derived hours over a date range, with the
 * ability to correct them. There is no "start a timer" control — hours are
 * produced by job status transitions, so the manual actions are: stop a clock
 * left running, edit an entry, add one the clock missed, and delete a mistake.
 */
function OfficeTimesheet() {
    const qc = useQueryClient();

    const defaults = useMemo(thisWeekRange, []);
    const [from, setFrom] = useState(defaults.from);
    const [to, setTo] = useState(defaults.to);
    const [techFilter, setTechFilter] = useState('');

    const [editing, setEditing] = useState<TimeEntry | null>(null);
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState<TimeEntry | null>(null);

    const params = { from, to, userId: techFilter || undefined };

    const { data, isLoading } = useQuery({
        queryKey: ['time-entries', from, to, techFilter],
        queryFn: () => api.get('/time-tracking', { params }).then(r => r.data.data),
        refetchInterval: 30000,
    });

    const { data: techs } = useQuery<TechOption[]>({
        queryKey: ['time-techs'],
        queryFn: () =>
            api.get('/users').then(r =>
                (r.data?.data?.users ?? []).filter((u: any) => u.role === 'TECHNICIAN'),
            ),
    });
    const { data: jobs } = useQuery<JobOption[]>({
        queryKey: ['time-jobs'],
        queryFn: () =>
            api.get('/jobs?limit=100').then(r =>
                (r.data?.data?.items ?? []).map((j: any) => ({ id: j.id, title: j.title })),
            ),
    });

    const entries: TimeEntry[] = data?.entries ?? [];
    const totals: TechTotal[] = data?.totals ?? [];
    const running = entries.filter(e => !e.endTime);

    const stopEntry = useMutation({
        mutationFn: (id: string) => api.post(`/time-tracking/${id}/stop`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries'] }),
    });

    const exportCsv = async () => {
        const res = await api.get('/time-tracking/export', { params, responseType: 'blob' });
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `labour-hours-${from}_to_${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const rangeSeconds = totals.reduce((acc, t) => acc + t.totalSeconds, 0);

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
                    <p className="text-xs text-muted-foreground">Total for range</p>
                    <p className="font-mono text-2xl font-bold tabular-nums">{formatDuration(rangeSeconds)}</p>
                </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Technicians don&apos;t fill in timesheets. Travel starts when they head to a job and
                on-site time starts when they arrive; both stop when the job is done.
            </p>

            {/* Filters: date range, technician, add + export */}
            <Card>
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">From</Label>
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-[150px]" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">To</Label>
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-[150px]" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Technician</Label>
                            <select
                                value={techFilter}
                                onChange={e => setTechFilter(e.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                            >
                                <option value="">All technicians</option>
                                {(techs ?? []).map(t => (
                                    <option key={t.id} value={t.id}>{displayName(t, t.email)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
                            <Download className="mr-1 h-4 w-4" /> Export CSV
                        </Button>
                        <Button size="sm" onClick={() => setAdding(true)}>
                            <Plus className="mr-1 h-4 w-4" /> Add missed entry
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Per-technician totals for the range */}
            {totals.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {totals.map(t => (
                        <div key={t.userId} className="flex items-center justify-between rounded-xl border bg-white p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{t.name}</p>
                                <p className="text-xs text-muted-foreground">{t.entryCount} entr{t.entryCount === 1 ? 'y' : 'ies'}</p>
                            </div>
                            <p className="shrink-0 font-mono text-sm font-bold tabular-nums">{formatDuration(t.totalSeconds)}</p>
                        </div>
                    ))}
                </div>
            )}

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
                        <Calendar className="h-3 w-3" /> Entries for the selected range
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
                            <p className="text-sm">No hours in this range.</p>
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
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Edit entry"
                                                            className="h-7 w-7"
                                                            onClick={() => setEditing(entry)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Delete entry"
                                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                                            onClick={() => setDeleting(entry)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
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

            {editing && (
                <EditEntryDialog
                    entry={editing}
                    jobs={jobs ?? []}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['time-entries'] }); }}
                />
            )}
            {adding && (
                <AddEntryDialog
                    techs={techs ?? []}
                    jobs={jobs ?? []}
                    onClose={() => setAdding(false)}
                    onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ['time-entries'] }); }}
                />
            )}
            {deleting && (
                <DeleteEntryDialog
                    entry={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => { setDeleting(null); qc.invalidateQueries({ queryKey: ['time-entries'] }); }}
                />
            )}
        </div>
    );
}

function EditEntryDialog({
    entry, jobs, onClose, onSaved,
}: { entry: TimeEntry; jobs: JobOption[]; onClose: () => void; onSaved: () => void }) {
    const [start, setStart] = useState(toLocalInput(entry.startTime));
    const [end, setEnd] = useState(toLocalInput(entry.endTime));
    const [jobId, setJobId] = useState(entry.job?.id ?? '');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const save = useMutation({
        mutationFn: () =>
            api.patch(`/time-tracking/${entry.id}`, {
                startTime: start ? localInputToIso(start) : undefined,
                endTime: end ? localInputToIso(end) : undefined,
                jobId: jobId || undefined,
                reason,
            }),
        onSuccess: onSaved,
        onError: (e) => setError(errMessage(e)),
    });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit time entry</DialogTitle>
                    <DialogDescription>
                        Correct {displayName(entry.user, 'this technician')}&apos;s hours. A reason is recorded on the audit trail.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Start</Label>
                            <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">End</Label>
                            <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Job (optional)</Label>
                        <select
                            value={jobId}
                            onChange={e => setJobId(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                            <option value="">No job</option>
                            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Reason *</Label>
                        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being changed?" />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { setError(''); save.mutate(); }} disabled={save.isPending || !reason.trim()}>
                        {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AddEntryDialog({
    techs, jobs, onClose, onSaved,
}: { techs: TechOption[]; jobs: JobOption[]; onClose: () => void; onSaved: () => void }) {
    const [userId, setUserId] = useState('');
    const [jobId, setJobId] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    const save = useMutation({
        mutationFn: () =>
            api.post('/time-tracking/manual', {
                userId,
                jobId: jobId || undefined,
                startTime: localInputToIso(start),
                endTime: localInputToIso(end),
                note,
            }),
        onSuccess: onSaved,
        onError: (e) => setError(errMessage(e)),
    });

    const valid = userId && start && end && note.trim();

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add missed entry</DialogTitle>
                    <DialogDescription>
                        Record labour the status clock never captured. A reason is required.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Technician *</Label>
                        <select
                            value={userId}
                            onChange={e => setUserId(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                            <option value="">Select a technician…</option>
                            {techs.map(t => <option key={t.id} value={t.id}>{displayName(t, t.email)}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Job (optional)</Label>
                        <select
                            value={jobId}
                            onChange={e => setJobId(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                            <option value="">No job</option>
                            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Start *</Label>
                            <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">End *</Label>
                            <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Reason / note *</Label>
                        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Forgot to mark arrival on site" />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { setError(''); save.mutate(); }} disabled={save.isPending || !valid}>
                        {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Add entry
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteEntryDialog({
    entry, onClose, onDeleted,
}: { entry: TimeEntry; onClose: () => void; onDeleted: () => void }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const del = useMutation({
        mutationFn: () => api.delete(`/time-tracking/${entry.id}`, { data: { reason: reason || undefined } }),
        onSuccess: onDeleted,
        onError: (e) => setError(errMessage(e)),
    });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete time entry?</DialogTitle>
                    <DialogDescription>
                        This permanently removes {displayName(entry.user, 'the technician')}&apos;s entry of{' '}
                        {formatDuration(entry.duration)}. The full entry is kept on the audit trail.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being deleted?" />
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={() => { setError(''); del.mutate(); }}
                        disabled={del.isPending}
                    >
                        {del.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
