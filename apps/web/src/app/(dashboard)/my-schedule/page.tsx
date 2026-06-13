"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Calendar, MapPin, Phone, Clock, Truck, CheckCircle2, Play, PauseCircle } from "lucide-react";
import api from "../../../lib/api";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
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
    COMPLETED: "Completed",
    CANCELED: "Canceled",
};

const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-100 text-blue-700",
    EN_ROUTE: "bg-violet-100 text-violet-700",
    ON_SITE: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELED: "bg-rose-100 text-rose-700",
};

export default function MySchedulePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const calendarRef = useRef<FullCalendar | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<WeekEvent | null>(null);
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
    const isLoading = eventsQuery.isLoading;
    const rangeLabel = `${format(new Date(range.start), "d MMM")} – ${format(new Date(range.end), "d MMM yyyy")}`;

    // Status changes route through the offline mutation default — they queue
    // when there's no signal and patch the calendar optimistically.
    const statusMutation = useMutation<unknown, any, { jobId: string; status: string }>({
        mutationKey: OFFLINE_KEYS.status,
    });
    const setStatus = (jobId: string, status: string) => {
        statusMutation.mutate({ jobId, status });
        setSelectedEvent((cur) =>
            cur && cur.id === jobId
                ? { ...cur, extendedProps: { ...cur.extendedProps, status } }
                : cur
        );
    };

    // "On my way" notifies the customer (SMS) — inherently an online action.
    const onMyWayMutation = useMutation({
        mutationFn: async (jobId: string) => {
            await api.post(`/schedule/jobs/${jobId}/on-my-way`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["my-week"] }),
    });
    const onMyWay = (jobId: string) => onMyWayMutation.mutate(jobId);

    const onDatesSet = (arg: { start: Date; end: Date }) => {
        setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
    };

    const todayJobs = events.filter(
        (e) => e.start && format(new Date(e.start), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
    );
    const upcomingJobs = events.filter(
        (e) => e.start && new Date(e.start) > new Date()
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">My Schedule</h1>
                <p className="page-subtitle">
                    Your jobs for the week — plan ahead and know what&apos;s coming.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{events.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Jobs this week</p>
                    <p className="text-xs text-muted-foreground">{rangeLabel}</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600">
                            <Clock className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{todayJobs.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Today</p>
                    <p className="text-xs text-muted-foreground">Jobs scheduled for today</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{upcomingJobs.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Upcoming</p>
                    <p className="text-xs text-muted-foreground">Remaining jobs ahead</p>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
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
                                    {selectedEvent.extendedProps.status === "ASSIGNED" && (
                                        <Button
                                            disabled={onMyWayMutation.isPending}
                                            onClick={() => onMyWay(selectedEvent.id)}
                                            className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
                                        >
                                            <Truck className="h-4 w-4" /> On my way (notify customer)
                                        </Button>
                                    )}
                                    {selectedEvent.extendedProps.status === "EN_ROUTE" && (
                                        <Button
                                            onClick={() => setStatus(selectedEvent.id, "ON_SITE")}
                                            className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
                                        >
                                            <Play className="h-4 w-4" /> Arrived / Start work
                                        </Button>
                                    )}
                                    {selectedEvent.extendedProps.status === "ON_SITE" && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                onClick={() => setStatus(selectedEvent.id, "PAUSED")}
                                                variant="outline"
                                                className="gap-1"
                                            >
                                                <PauseCircle className="h-4 w-4" /> Pause
                                            </Button>
                                            <Button
                                                onClick={() => router.push(`/jobs/${selectedEvent.id}`)}
                                                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                                            >
                                                <CheckCircle2 className="h-4 w-4" /> Finish
                                            </Button>
                                        </div>
                                    )}
                                    {selectedEvent.extendedProps.status === "PAUSED" && (
                                        <Button
                                            onClick={() => setStatus(selectedEvent.id, "ON_SITE")}
                                            className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
                                        >
                                            <Play className="h-4 w-4" /> Resume
                                        </Button>
                                    )}
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
