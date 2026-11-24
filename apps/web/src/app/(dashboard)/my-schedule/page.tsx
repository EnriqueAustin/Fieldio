"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
    format,
    startOfWeek,
    endOfWeek,
    startOfDay,
    isToday,
    isTomorrow,
    isBefore,
} from "date-fns";
import {
    Calendar,
    MapPin,
    Phone,
    Clock,
    Truck,
    CheckCircle2,
    Play,
    PauseCircle,
    AlertTriangle,
    ChevronDown,
    Layers,
} from "lucide-react";
import api from "../../../lib/api";
import { useAuthStore } from "../../../store/auth";
import { useJobProgress } from "../../../components/dashboard/technician/use-job-progress";
import { useFieldLiveUpdates } from "../../../components/dashboard/technician/use-live-updates";
import type { TechnicianJob } from "../../../components/dashboard/technician/types";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { useRouter } from "next/navigation";

type WeekEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    backgroundColor: string;
    extendedProps: {
        status: string;
        priority: string;
        customerName: string;
        customerPhone?: string | null;
        address: string;
        vanName?: string | null;
    };
};

const STATUS_LABELS: Record<string, string> = {
    REQUESTED: "Requested",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
};

const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-100 text-blue-700",
    EN_ROUTE: "bg-violet-100 text-violet-700",
    ON_SITE: "bg-amber-100 text-amber-700",
    PAUSED: "bg-orange-100 text-orange-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELED: "bg-rose-100 text-rose-700",
};

// A job as returned by /jobs/assigned/me (pricing already stripped server-side).
type AssignedJob = {
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    customer?: { name: string; phone?: string | null } | null;
    property?: { addressLine1: string; city?: string | null } | null;
    van?: { name: string } | null;
};

// The shared shape both the week feed and the assigned feed normalise into so the
// mobile agenda card can render either.
type AgendaJob = {
    id: string;
    title: string;
    start: string | null;
    end: string | null;
    status: string;
    priority: string;
    customerName: string;
    customerPhone?: string | null;
    address: string;
    vanName?: string | null;
};

const fromWeekEvent = (e: WeekEvent): AgendaJob => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    status: e.extendedProps.status,
    priority: e.extendedProps.priority,
    customerName: e.extendedProps.customerName,
    customerPhone: e.extendedProps.customerPhone,
    address: e.extendedProps.address,
    vanName: e.extendedProps.vanName,
});

const fromAssigned = (j: AssignedJob): AgendaJob => ({
    id: j.id,
    title: j.customer?.name ? `${j.title} - ${j.customer.name}` : j.title,
    start: j.scheduledStart,
    end: j.scheduledEnd,
    status: j.status,
    priority: j.priority,
    customerName: j.customer?.name ?? "",
    customerPhone: j.customer?.phone,
    address: j.property ? `${j.property.addressLine1}${j.property.city ? `, ${j.property.city}` : ""}` : "",
    vanName: j.van?.name,
});

// Best-effort suburb: the segment after the last comma of "line1, city".
const suburbOf = (address: string) => {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
};

const dayHeading = (d: Date) => {
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEEE d MMM");
};

export default function MySchedulePage() {
    const router = useRouter();
    const userId = useAuthStore((s) => s.user?.id);
    const calendarRef = useRef<FullCalendar | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<WeekEvent | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [range, setRange] = useState(() => {
        const start = startOfWeek(new Date(), { weekStartsOn: 1 });
        const end = endOfWeek(new Date(), { weekStartsOn: 1 });
        return { start: start.toISOString(), end: end.toISOString() };
    });

    // React Query so the week persists to IndexedDB and renders offline.
    const eventsQuery = useQuery({
        queryKey: ["my-week", range.start, range.end],
        queryFn: async () => {
            const response = await api.get("/schedule/my-week", {
                params: { start: range.start, end: range.end },
            });
            return response.data.data.events as WeekEvent[];
        },
    });
    const events = eventsQuery.data ?? [];
    const rangeLabel = `${format(new Date(range.start), "d MMM")} – ${format(new Date(range.end), "d MMM yyyy")}`;

    // All open jobs (any date) — the source of the backlog / overdue counts so
    // "Jobs this week = 0" isn't misleading when older jobs are still open.
    const assignedQuery = useQuery({
        queryKey: ["my-open-jobs"],
        queryFn: async () => {
            const response = await api.get("/jobs/assigned/me");
            return response.data.data.jobs as AssignedJob[];
        },
    });
    const openJobs = assignedQuery.data ?? [];

    // Every status change — including "On my way" (EN_ROUTE), which texts the
    // customer their tracking link — goes through the same offline status
    // mutation as the field console: queued without signal, FIFO-ordered,
    // idempotent, guarded server-side, and patched into the cached week and
    // open-jobs lists optimistically.
    const { statusMutation } = useJobProgress();
    const setStatus = (jobId: string, status: TechnicianJob["status"]) => {
        // A swallowed double-tap sent nothing — don't show a status we never sent.
        if (!statusMutation.mutate({ jobId, status })) return;
        setSelectedEvent((cur) =>
            cur && cur.id === jobId
                ? { ...cur, extendedProps: { ...cur.extendedProps, status } }
                : cur
        );
    };
    // Finishing a job (checklist, signature, forms, invoice) happens in the
    // field console's job flow, not the office job page.
    const openFieldJob = (jobId: string) => router.push(`/?job=${encodeURIComponent(jobId)}`);

    // Office assigns/moves work → refetch the week live.
    const isMyJob = useCallback(
        (push: { id?: string }) =>
            (eventsQuery.data ?? []).some((e) => e.id === push.id) ||
            (assignedQuery.data ?? []).some((j) => j.id === push.id),
        [eventsQuery.data, assignedQuery.data]
    );
    useFieldLiveUpdates(userId, isMyJob);

    const onDatesSet = (arg: { start: Date; end: Date }) => {
        setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
    };

    const todayJobs = events.filter(
        (e) => e.start && format(new Date(e.start), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
    );
    const upcomingJobs = events.filter((e) => e.start && new Date(e.start) > new Date());

    // ---- Mobile agenda grouping ---------------------------------------------
    const todayStart = startOfDay(new Date());

    // Overdue = open jobs scheduled before today (or with no date at all).
    const overdue = useMemo(
        () =>
            openJobs
                .filter((j) => {
                    if (j.status === "COMPLETED" || j.status === "CANCELED") return false;
                    // Multi-day work under way is today's work, not overdue.
                    if (j.status === "ON_SITE" || j.status === "PAUSED") return false;
                    if (!j.scheduledStart) return true;
                    return isBefore(new Date(j.scheduledStart), todayStart);
                })
                .map(fromAssigned)
                .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
        [openJobs, todayStart]
    );

    // The week's scheduled jobs grouped by day, today first then ascending.
    const dayGroups = useMemo(() => {
        const groups = new Map<string, { date: Date; jobs: AgendaJob[] }>();
        const rangeStart = new Date(range.start);
        const rangeEnd = new Date(range.end);
        const now = new Date();
        const todayInRange = now >= rangeStart && now < rangeEnd;
        for (const e of events) {
            if (!e.start) continue;
            const start = new Date(e.start);
            // A multi-day job that began before this week lands on the week's
            // first day; one under way (on site / paused) sits under Today.
            const inProgress = e.extendedProps.status === "ON_SITE" || e.extendedProps.status === "PAUSED";
            const d =
                inProgress && todayInRange && start < startOfDay(now)
                    ? now
                    : start < rangeStart
                    ? rangeStart
                    : start;
            const key = format(d, "yyyy-MM-dd");
            const bucket = groups.get(key) ?? { date: startOfDay(d), jobs: [] };
            bucket.jobs.push(fromWeekEvent(e));
            groups.set(key, bucket);
        }
        return Array.from(groups.values())
            .map((g) => ({
                ...g,
                jobs: g.jobs.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
            }))
            .sort((a, b) => {
                // Today always first, then chronological.
                const at = isToday(a.date) ? -Infinity : a.date.getTime();
                const bt = isToday(b.date) ? -Infinity : b.date.getTime();
                return at - bt;
            });
    }, [events, range.start, range.end]);

    const openCount = openJobs.filter(
        (j) => j.status !== "COMPLETED" && j.status !== "CANCELED"
    ).length;

    // Status buttons shared by the mobile agenda card and the desktop panel.
    // Never disabled while an earlier change syncs — it queues behind it.
    const renderStatusActions = (jobId: string, status: string, size = "") => (
        <>
            {status === "ASSIGNED" && (
                <Button
                    onClick={() => setStatus(jobId, "EN_ROUTE")}
                    className={`w-full ${size} bg-violet-600 hover:bg-violet-700 gap-2`}
                >
                    <Truck className="h-4 w-4" /> On my way (notify customer)
                </Button>
            )}
            {status === "EN_ROUTE" && (
                <Button
                    onClick={() => setStatus(jobId, "ON_SITE")}
                    className={`w-full ${size} bg-amber-500 hover:bg-amber-600 gap-2`}
                >
                    <Play className="h-4 w-4" /> Arrived / Start work
                </Button>
            )}
            {status === "ON_SITE" && (
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        onClick={() => setStatus(jobId, "PAUSED")}
                        variant="outline"
                        className={`${size} gap-1`}
                    >
                        <PauseCircle className="h-4 w-4" /> Leave for today
                    </Button>
                    <Button
                        onClick={() => openFieldJob(jobId)}
                        className={`${size} bg-emerald-600 hover:bg-emerald-700 gap-1`}
                    >
                        <CheckCircle2 className="h-4 w-4" /> Finish
                    </Button>
                </div>
            )}
            {status === "PAUSED" && (
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        onClick={() => setStatus(jobId, "EN_ROUTE")}
                        className={`${size} bg-violet-600 hover:bg-violet-700 gap-1`}
                    >
                        <Truck className="h-4 w-4" /> Resume
                    </Button>
                    <Button
                        onClick={() => setStatus(jobId, "ON_SITE")}
                        variant="outline"
                        className={`${size} gap-1`}
                    >
                        <Play className="h-4 w-4" /> I&apos;m on site
                    </Button>
                </div>
            )}
        </>
    );

    const renderActions = (job: AgendaJob) => (
        <div className="space-y-2 border-t pt-3">
            <Button asChild variant="outline" className="w-full min-h-[44px]">
                <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <MapPin className="mr-2 h-4 w-4" />
                    Open in Maps
                </a>
            </Button>
            {job.customerPhone && (
                <Button asChild variant="outline" className="w-full min-h-[44px]">
                    <a href={`tel:${job.customerPhone}`}>
                        <Phone className="mr-2 h-4 w-4" />
                        Call {job.customerName || "customer"}
                    </a>
                </Button>
            )}
            {renderStatusActions(job.id, job.status, "min-h-[44px]")}
            <Button
                onClick={() => router.push(`/jobs/${job.id}`)}
                variant="outline"
                className="w-full min-h-[44px]"
            >
                Open full job
            </Button>
        </div>
    );

    const AgendaCard = ({ job, overdue: isOverdue }: { job: AgendaJob; overdue?: boolean }) => {
        const expanded = expandedId === job.id;
        const suburb = suburbOf(job.address);
        const emergency = job.priority === "EMERGENCY";
        return (
            <div
                className={`rounded-2xl border bg-white ${
                    isOverdue ? "border-rose-200" : "border-border"
                }`}
            >
                <button
                    onClick={() => setExpandedId(expanded ? null : job.id)}
                    className="flex w-full min-h-[56px] items-center gap-3 p-4 text-left"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {emergency && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                    <AlertTriangle className="h-3 w-3" /> Emergency
                                </span>
                            )}
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    STATUS_STYLES[job.status] ?? ""
                                }`}
                            >
                                {STATUS_LABELS[job.status] ?? job.status}
                            </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold">{job.title}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {job.start ? format(new Date(job.start), "p") : "No time set"}
                            </span>
                            {suburb && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{suburb}</span>
                                </span>
                            )}
                        </p>
                    </div>
                    <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                            expanded ? "rotate-180" : ""
                        }`}
                    />
                </button>
                {expanded && (
                    <div className="space-y-3 px-4 pb-4 text-sm">
                        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                            <div className="flex items-start gap-2">
                                <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                <div>
                                    {job.start && <p>{format(new Date(job.start), "EEEE d MMM, p")}</p>}
                                    {job.end && (
                                        <p className="text-muted-foreground">
                                            to {format(new Date(job.end), "p")}
                                        </p>
                                    )}
                                    {!job.start && <p className="text-muted-foreground">No time scheduled</p>}
                                </div>
                            </div>
                            {job.address && (
                                <div className="flex items-start gap-2">
                                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                    <p>{job.address}</p>
                                </div>
                            )}
                            {job.customerPhone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <a
                                        href={`tel:${job.customerPhone}`}
                                        className="text-blue-600 hover:underline"
                                    >
                                        {job.customerPhone}
                                    </a>
                                </div>
                            )}
                            {job.vanName && (
                                <div className="flex items-center gap-2">
                                    <Truck className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">{job.vanName}</span>
                                </div>
                            )}
                        </div>
                        {renderActions(job)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">My Schedule</h1>
                <p className="page-subtitle">
                    Your jobs for the week — plan ahead and know what&apos;s coming.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{events.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Jobs this week</p>
                    <p className="text-xs text-muted-foreground">{rangeLabel}</p>
                </div>
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600">
                            <Clock className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{todayJobs.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Today</p>
                    <p className="text-xs text-muted-foreground">Scheduled for today</p>
                </div>
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-indigo-50 text-indigo-600">
                            <Layers className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{openCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Open jobs</p>
                    <p className="text-xs text-muted-foreground">
                        {overdue.length > 0 ? `${overdue.length} overdue` : "All up to date"}
                    </p>
                </div>
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{upcomingJobs.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Upcoming</p>
                    <p className="text-xs text-muted-foreground">Later this week</p>
                </div>
            </div>

            {/* Mobile: agenda / day list (default below md) */}
            <div className="space-y-5 md:hidden">
                {overdue.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                            <AlertTriangle className="h-4 w-4" />
                            Overdue ({overdue.length})
                        </h2>
                        <div className="space-y-2">
                            {overdue.map((job) => (
                                <AgendaCard key={job.id} job={job} overdue />
                            ))}
                        </div>
                    </section>
                )}

                {dayGroups.length === 0 && overdue.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <Calendar className="h-8 w-8 text-slate-300" />
                            <p className="mt-3 text-sm font-medium">Nothing scheduled</p>
                            <p className="text-xs text-muted-foreground">
                                No jobs for this week yet.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    dayGroups.map((group) => (
                        <section key={group.date.toISOString()} className="space-y-2">
                            <h2 className="flex items-center justify-between text-sm font-semibold">
                                <span>{dayHeading(group.date)}</span>
                                <span className="text-xs font-normal text-muted-foreground">
                                    {group.jobs.length} job{group.jobs.length !== 1 ? "s" : ""}
                                </span>
                            </h2>
                            <div className="space-y-2">
                                {group.jobs.map((job) => (
                                    <AgendaCard key={job.id} job={job} />
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>

            {/* Desktop: FullCalendar week grid + details side panel (md and up) */}
            <div className="hidden gap-6 md:grid xl:grid-cols-[1fr_340px]">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border/70">
                        <CardTitle>Week view</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 md:p-3">
                        <div className="h-[620px]">
                            <FullCalendar
                                ref={calendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin]}
                                initialView="timeGridWeek"
                                headerToolbar={{
                                    left: "prev,next today",
                                    center: "title",
                                    right: "timeGridWeek,timeGridDay",
                                }}
                                events={events}
                                datesSet={onDatesSet}
                                eventClick={(info) => {
                                    const ev = events.find((e) => e.id === info.event.id);
                                    setSelectedEvent(ev ?? null);
                                }}
                                height="100%"
                                slotMinTime="06:00:00"
                                slotMaxTime="20:00:00"
                                allDaySlot={false}
                                nowIndicator
                                editable={false}
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {selectedEvent ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{selectedEvent.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                            STATUS_STYLES[selectedEvent.extendedProps.status] ?? ""
                                        }`}
                                    >
                                        {STATUS_LABELS[selectedEvent.extendedProps.status] ?? selectedEvent.extendedProps.status}
                                    </span>
                                    {selectedEvent.extendedProps.vanName && (
                                        <span className="text-xs text-muted-foreground">
                                            {selectedEvent.extendedProps.vanName}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                                    <div className="flex items-start gap-2">
                                        <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                        <div>
                                            {selectedEvent.start && (
                                                <p>{format(new Date(selectedEvent.start), "EEEE d MMM, p")}</p>
                                            )}
                                            {selectedEvent.end && (
                                                <p className="text-muted-foreground">
                                                    to {format(new Date(selectedEvent.end), "p")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                        <p>{selectedEvent.extendedProps.address}</p>
                                    </div>
                                    {selectedEvent.extendedProps.customerPhone && (
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <a
                                                href={`tel:${selectedEvent.extendedProps.customerPhone}`}
                                                className="text-blue-600 hover:underline"
                                            >
                                                {selectedEvent.extendedProps.customerPhone}
                                            </a>
                                        </div>
                                    )}
                                </div>

                                <Button asChild variant="outline" className="w-full">
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.extendedProps.address)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <MapPin className="mr-2 h-4 w-4" />
                                        Open in Maps
                                    </a>
                                </Button>

                                <div className="space-y-2 border-t pt-3">
                                    {renderStatusActions(selectedEvent.id, selectedEvent.extendedProps.status)}
                                    <Button
                                        onClick={() => router.push(`/jobs/${selectedEvent.id}`)}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        Open full job
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Calendar className="h-8 w-8 text-slate-300" />
                                <p className="mt-3 text-sm font-medium">Select a job</p>
                                <p className="text-xs text-muted-foreground">
                                    Click any event on the calendar to see details.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">This week&apos;s jobs</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {events.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No jobs scheduled this week.</p>
                            ) : (
                                events.map((ev) => (
                                    <button
                                        key={ev.id}
                                        onClick={() => setSelectedEvent(ev)}
                                        className={`w-full rounded-xl border p-3 text-left transition hover:bg-slate-50 ${
                                            selectedEvent?.id === ev.id ? "border-slate-900 bg-slate-50" : "border-border"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{ev.title}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {ev.start ? format(new Date(ev.start), "EEE d MMM, p") : "TBD"}
                                                </p>
                                            </div>
                                            <span
                                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                                    STATUS_STYLES[ev.extendedProps.status] ?? ""
                                                }`}
                                            >
                                                {STATUS_LABELS[ev.extendedProps.status] ?? ev.extendedProps.status}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
