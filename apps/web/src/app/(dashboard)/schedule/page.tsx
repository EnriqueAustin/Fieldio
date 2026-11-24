"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { addDays, format, isSameDay, startOfDay, endOfDay } from "date-fns";
import { isAxiosError } from "axios";
import Link from "next/link";
import {
    AlertOctagon,
    CalendarClock,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    LayoutList,
    Maximize2,
    Minimize2,
    MapPinned,
    RefreshCcw,
    Satellite,
    TimerReset,
    X,
} from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { DispatchMap } from "../../../components/schedule/dispatch-map";
import { DispatchBoard, type BoardEvent, type BoardLane } from "../../../components/schedule/dispatch-board";
import { UnscheduledJobsPanel } from "../../../components/schedule/unscheduled-jobs-panel";
import { TechSuggestModal } from "../../../components/schedule/tech-suggest-modal";
import { ReassignDialog } from "../../../components/schedule/reassign-dialog";
import { JobQuickView, type QuickViewJob } from "../../../components/schedule/job-quick-view";
import { TechRoutePanel } from "../../../components/schedule/tech-route-panel";
import { useCompanySettings } from "../../../components/dashboard/technician/use-company-settings";
import { toast } from "../../../components/ui/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { socket } from "../../../lib/socket";
import { useAuthStore } from "../../../store/auth";
import { useRouter } from "next/navigation";
import {
    calendarHoursRange,
    computeAvailability,
    defaultDropStart,
    displayName,
    fcBusinessHours,
    hoursForDate,
    type Availability,
} from "../../../lib/schedule-utils";

type ScheduleEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    backgroundColor?: string;
    editable?: boolean;
    extendedProps: {
        customerId?: string;
        techId?: string | null;
        vanId?: string | null;
        status: string;
        address?: string;
        techName?: string | null;
        vanName?: string | null;
        customerName?: string | null;
        customerPhone?: string | null;
        priority?: string | null;
        jobTitle?: string | null;
        propertyId?: string | null;
    };
};

type Technician = {
    id: string;
    email: string;
    role: string;
    status: string;
    firstName?: string | null;
    lastName?: string | null;
};

type VanTeam = {
    id: string;
    name: string;
    active: boolean;
    registration?: string | null;
    members: { id: string; role: string; user: { id: string; email: string; firstName?: string | null; lastName?: string | null } }[];
    _count: { jobs: number };
};

type LivePing = {
    id: string;
    userId: string;
    lat: number;
    lng: number;
    createdAt: string;
    isStale: boolean;
    user: {
        id: string;
        email: string;
        role: string;
    };
    activeJob: null | {
        id: string;
        title: string;
        status: string;
        customerName: string;
        address: string;
        destination: { lat: number; lng: number } | null;
    };
};

type RecurringPlan = { id: string; active: boolean; isDue: boolean };

type UnscheduledJob = { id: string; priority?: string };

type ViewMode = "board" | "calendar";

type CalendarOptions = ComponentProps<typeof FullCalendar>;
type Arg<K extends keyof CalendarOptions> = NonNullable<CalendarOptions[K]> extends (arg: infer A) => unknown ? A : never;

const HOUR_MS = 60 * 60 * 1000;

const AVAILABILITY_LABEL: Record<Availability, string> = {
    FREE: "Available",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    BUSY: "Scheduled",
    OFFLINE: "Offline",
};

const AVAILABILITY_DOT: Record<Availability, string> = {
    FREE: "bg-emerald-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    BUSY: "bg-blue-500",
    OFFLINE: "bg-muted-foreground/40",
};

const errorMessage = (err: unknown, fallback: string): string => {
    if (isAxiosError<{ message?: string }>(err)) return err.response?.data?.message ?? fallback;
    return fallback;
};

const isMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0;

const toQuickView = (event: ScheduleEvent): QuickViewJob => ({
    id: event.id,
    title: event.extendedProps.jobTitle || event.title,
    start: event.start,
    end: event.end,
    status: event.extendedProps.status,
    priority: event.extendedProps.priority,
    customerName: event.extendedProps.customerName,
    customerPhone: event.extendedProps.customerPhone,
    address: event.extendedProps.address,
    techName: event.extendedProps.techName,
    vanName: event.extendedProps.vanName,
});

const toBoardEvent = (event: ScheduleEvent): BoardEvent => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    backgroundColor: event.backgroundColor,
    editable: event.editable,
    extendedProps: {
        techId: event.extendedProps.techId ?? undefined,
        vanId: event.extendedProps.vanId ?? undefined,
        status: event.extendedProps.status,
        customerName: event.extendedProps.customerName ?? undefined,
        address: event.extendedProps.address,
        techName: event.extendedProps.techName ?? undefined,
        vanName: event.extendedProps.vanName ?? undefined,
    },
});

export default function SchedulePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { accessToken } = useAuthStore();
    const { settings } = useCompanySettings();
    const businessHours = settings?.businessHours;
    const calendarRef = useRef<FullCalendar | null>(null);
    const fullscreenRef = useRef<HTMLDivElement | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [view, setView] = useState<ViewMode>("board");
    const [boardDate, setBoardDate] = useState<Date>(() => startOfDay(new Date()));
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [suggestJobId, setSuggestJobId] = useState<string | null>(null);
    const [reassignJob, setReassignJob] = useState<ScheduleEvent | null>(null);
    const [quickJob, setQuickJob] = useState<ScheduleEvent | null>(null);
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [todayEvents, setTodayEvents] = useState<ScheduleEvent[]>([]);
    // Tagged with the day they belong to so a new day never flashes the previous day's jobs.
    const [dayEvents, setDayEvents] = useState<{ day: string; events: ScheduleEvent[] }>({ day: "", events: [] });
    const [dayLoading, setDayLoading] = useState(false);
    const [dayError, setDayError] = useState(false);
    const [techs, setTechs] = useState<Technician[]>([]);
    const [pings, setPings] = useState<LivePing[]>([]);
    const [vanTeams, setVanTeams] = useState<VanTeam[]>([]);
    const [plans, setPlans] = useState<RecurringPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [bootstrapError, setBootstrapError] = useState(false);

    // Mirror pings into a ref so the socket handler can check membership without
    // re-subscribing on every ping.
    const pingsRef = useRef<LivePing[]>([]);
    useEffect(() => {
        pingsRef.current = pings;
    }, [pings]);

    // The board day lives in a ref too, so socket refreshes reload whatever day
    // is on screen and late responses for a day we've left are ignored.
    const boardDateRef = useRef(boardDate);
    useEffect(() => {
        boardDateRef.current = boardDate;
    }, [boardDate]);

    // Unscheduled KPI reads the same query the panel uses, so the tile and the
    // list never disagree (and van-assigned jobs aren't miscounted).
    const { data: unscheduledJobs = [] } = useQuery<UnscheduledJob[]>({
        queryKey: ["unscheduled-jobs"],
        queryFn: () => api.get("/schedule/unscheduled").then((r) => r.data.data.jobs),
        refetchInterval: 30_000,
    });

    const refreshCalendar = useCallback(async (start: Date, end: Date) => {
        const response = await api.get("/schedule/events", {
            params: { start: start.toISOString(), end: end.toISOString() },
        });
        setEvents(response.data.data.events);
    }, []);

    // Today's events feed the roster and the KPIs. They are fetched independently
    // of the visible calendar range so navigating weeks doesn't make everyone look
    // "Available".
    const fetchTodayEvents = useCallback(async () => {
        const response = await api.get("/schedule/events", {
            params: {
                start: startOfDay(new Date()).toISOString(),
                end: endOfDay(new Date()).toISOString(),
            },
        });
        setTodayEvents(response.data.data.events);
    }, []);

    // Board day other than today (today reuses todayEvents).
    const fetchBoardDay = useCallback(async (day: Date) => {
        setDayLoading(true);
        setDayError(false);
        try {
            const response = await api.get("/schedule/events", {
                params: { start: startOfDay(day).toISOString(), end: endOfDay(day).toISOString() },
            });
            if (isSameDay(boardDateRef.current, day)) {
                setDayEvents({ day: format(day, "yyyy-MM-dd"), events: response.data.data.events });
            }
        } catch (err) {
            console.error("Board day load failed:", err);
            if (isSameDay(boardDateRef.current, day)) setDayError(true);
        } finally {
            if (isSameDay(boardDateRef.current, day)) setDayLoading(false);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        const res = await api.get("/users");
        setTechs(res.data.data.users.filter((user: Technician) => user.role === "TECHNICIAN"));
    }, []);

    const fetchTracking = useCallback(async () => {
        const res = await api.get("/tracking/latest");
        setPings(res.data.data.pings);
    }, []);

    const fetchVans = useCallback(async () => {
        const res = await api.get("/vans").catch(() => ({ data: { data: { vans: [] as VanTeam[] } } }));
        setVanTeams(((res.data.data.vans ?? []) as VanTeam[]).filter((v) => v.active));
    }, []);

    // Only the due count is shown here; plans are managed on /recurring.
    const fetchRecurring = useCallback(async () => {
        const res = await api.get("/recurring");
        setPlans(res.data.data.plans);
    }, []);

    // "Refresh live data" button: only the fast-moving operational data.
    const refreshLiveData = useCallback(async () => {
        await Promise.all([fetchUsers(), fetchTracking(), fetchVans()]);
    }, [fetchUsers, fetchTracking, fetchVans]);

    const bootstrap = useCallback(async () => {
        setIsLoading(true);
        setBootstrapError(false);
        try {
            // The roster can't render without the user list — treat it as critical.
            await fetchUsers();
            // Everything else is best-effort so one failing endpoint can't blank the page.
            const results = await Promise.allSettled([
                fetchTracking(),
                fetchRecurring(),
                fetchVans(),
                fetchTodayEvents(),
            ]);
            results.forEach((r) => {
                if (r.status === "rejected") console.error("Dispatch data load failed:", r.reason);
            });
        } catch (err) {
            console.error("Dispatch bootstrap failed:", err);
            setBootstrapError(true);
        } finally {
            setIsLoading(false);
        }
    }, [fetchUsers, fetchTracking, fetchRecurring, fetchVans, fetchTodayEvents]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    const boardIsToday = isSameDay(boardDate, new Date());

    useEffect(() => {
        if (!boardIsToday) void fetchBoardDay(boardDate);
    }, [boardDate, boardIsToday, fetchBoardDay]);

    // Everything that shows scheduled work: calendar range, today, board day, panel.
    const refreshSchedule = useCallback(() => {
        const apiRef = calendarRef.current?.getApi();
        if (apiRef) void refreshCalendar(apiRef.view.activeStart, apiRef.view.activeEnd);
        void fetchTodayEvents();
        const day = boardDateRef.current;
        if (!isSameDay(day, new Date())) void fetchBoardDay(day);
        void queryClient.invalidateQueries({ queryKey: ["unscheduled-jobs"] });
        void queryClient.invalidateQueries({ queryKey: ["dispatch-tech-route"] });
    }, [refreshCalendar, fetchTodayEvents, fetchBoardDay, queryClient]);

    useEffect(() => {
        if (!accessToken) return;
        // Shared socket (autoConnect false): connect if nobody has yet.
        if (!socket.connected) socket.connect();

        const onScheduleChange = () => refreshSchedule();

        const onTechLocation = (payload: {
            userId: string;
            lat: number;
            lng: number;
            accuracy?: number;
            at: string;
        }) => {
            const known = pingsRef.current.some((p) => p.userId === payload.userId);
            if (!known) {
                // First ping from this tech this session — pull the full record once.
                void fetchTracking();
                return;
            }
            setPings((prev) =>
                prev.map((p) =>
                    p.userId === payload.userId
                        ? { ...p, lat: payload.lat, lng: payload.lng, createdAt: payload.at, isStale: false }
                        : p
                )
            );
        };

        socket.on("job:created", onScheduleChange);
        socket.on("schedule:updated", onScheduleChange);
        socket.on("tech:location", onTechLocation);

        return () => {
            // Only remove our own listeners; the socket is shared, so don't disconnect it.
            socket.off("job:created", onScheduleChange);
            socket.off("schedule:updated", onScheduleChange);
            socket.off("tech:location", onTechLocation);
        };
    }, [accessToken, refreshSchedule, fetchTracking]);

    // Expanded "wall-board" view for the dispatcher. Prefer the native Fullscreen
    // API (hides browser chrome), but fall back to a CSS overlay that fills the
    // viewport when fullscreen is blocked (permissions policy / embedded contexts),
    // so the bigger view always works. `isFullscreen` drives the layout either way.
    const collapse = () => {
        setIsFullscreen(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };

    const toggleFullscreen = () => {
        if (isFullscreen) {
            collapse();
            return;
        }
        setIsFullscreen(true);
        // Best-effort native fullscreen; the CSS overlay covers us if it's rejected.
        void fullscreenRef.current?.requestFullscreen?.().catch(() => {});
    };

    useEffect(() => {
        // Leaving native fullscreen (e.g. via Esc) should collapse the layout too.
        const onFsChange = () => {
            if (!document.fullscreenElement) setIsFullscreen(false);
        };
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    useEffect(() => {
        // Esc also exits the CSS-overlay fallback — but only when the user isn't
        // just closing a dialog (which handles its own Escape).
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (suggestJobId || reassignJob || quickJob) return;
            if (document.querySelector('[role="dialog"]')) return;
            setIsFullscreen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [suggestJobId, reassignJob, quickJob]);

    // Recompute the calendar's size whenever the view expands/collapses.
    useEffect(() => {
        const id = setTimeout(() => calendarRef.current?.getApi().updateSize(), 150);
        return () => clearTimeout(id);
    }, [isFullscreen, view]);

    const duePlans = plans.filter((plan) => plan.isDue && plan.active);

    // Map each tech to the van team ids they belong to, so a van-assigned job
    // counts toward every member's load.
    const vanIdsByTech = useMemo(() => {
        const map = new Map<string, Set<string>>();
        vanTeams.forEach((van) => {
            van.members.forEach((m) => {
                if (!map.has(m.user.id)) map.set(m.user.id, new Set());
                map.get(m.user.id)!.add(van.id);
            });
        });
        return map;
    }, [vanTeams]);

    const techRoster = useMemo(
        () =>
            techs.map((tech) => ({
                tech,
                ...computeAvailability({
                    techId: tech.id,
                    ping: pings.find((p) => p.userId === tech.id),
                    todayEvents,
                    vanIds: vanIdsByTech.get(tech.id),
                }),
            })),
        [techs, pings, todayEvents, vanIdsByTech]
    );

    // A selected tech who disappears from the roster (deactivated) clears the selection.
    const selectedTech = techs.find((t) => t.id === selectedTechId) ?? null;
    useEffect(() => {
        if (selectedTechId && techs.length > 0 && !techs.some((t) => t.id === selectedTechId)) {
            setSelectedTechId(null);
        }
    }, [selectedTechId, techs]);

    const freeCount = techRoster.filter((r) => r.availability === "FREE").length;
    const onSiteCount = techRoster.filter((r) => r.availability === "ON_SITE").length;
    const onTheRoadCount = techRoster.filter(
        (r) => r.availability === "EN_ROUTE" || r.availability === "ON_SITE"
    ).length;
    const techIds = new Set(techs.map((t) => t.id));
    const freshGpsCount = pings.filter((p) => !p.isStale && techIds.has(p.userId)).length;
    const emergencyCount = unscheduledJobs.filter((j) => j.priority === "EMERGENCY").length;
    const jobsTodayCount = todayEvents.filter((e) => e.extendedProps.status !== "CANCELED").length;
    const completedTodayCount = todayEvents.filter((e) => e.extendedProps.status === "COMPLETED").length;

    const activeTechs = pings.filter((ping) => ping.activeJob && !ping.isStale);

    const techPoints = activeTechs.map((ping) => {
        const tech = techs.find((t) => t.id === ping.userId);
        return {
            id: ping.id,
            label: tech ? displayName(tech) : ping.user.email.split("@")[0],
            lat: ping.lat,
            lng: ping.lng,
            tone: "tech" as const,
        };
    });

    const jobPoints = activeTechs
        .filter((ping) => ping.activeJob?.destination)
        .map((ping) => ({
            id: ping.activeJob!.id,
            label: ping.activeJob!.customerName,
            lat: ping.activeJob!.destination!.lat,
            lng: ping.activeJob!.destination!.lng,
            tone: "job" as const,
            techPointId: ping.id,
        }));

    // ---- Board ----
    const boardDayKey = format(boardDate, "yyyy-MM-dd");
    const boardSource = useMemo(
        () => (boardIsToday ? todayEvents : dayEvents.day === boardDayKey ? dayEvents.events : []),
        [boardIsToday, todayEvents, dayEvents, boardDayKey]
    );
    const boardEvents = useMemo(() => boardSource.map(toBoardEvent), [boardSource]);
    const boardHours = hoursForDate(businessHours, boardDate);

    const allLanes = useMemo<BoardLane[]>(
        () => [
            { id: "unassigned", kind: "unassigned", label: "Unassigned" },
            ...techRoster.map(({ tech, availability }) => ({
                id: tech.id,
                kind: "tech" as const,
                label: displayName(tech),
                sublabel: AVAILABILITY_LABEL[availability],
                status: availability,
            })),
            ...vanTeams.map((van) => ({
                id: van.id,
                kind: "van" as const,
                label: van.name,
                sublabel: van.members.map((m) => displayName(m.user)).join(", ") || "No crew",
            })),
        ],
        [techRoster, vanTeams]
    );

    // A selected tech narrows the board to Unassigned, their lane and the vans they crew.
    const lanes = useMemo<BoardLane[]>(() => {
        if (!selectedTechId) return allLanes;
        const vanIds = vanIdsByTech.get(selectedTechId);
        return allLanes.filter(
            (lane) =>
                lane.kind === "unassigned" ||
                (lane.kind === "tech" && lane.id === selectedTechId) ||
                (lane.kind === "van" && Boolean(vanIds?.has(lane.id)))
        );
    }, [allLanes, selectedTechId, vanIdsByTech]);

    const patchSchedule = async (
        move: {
            jobId: string;
            start: Date | string;
            end: Date | string;
            techId?: string | null;
            vanId?: string | null;
        },
        successTitle: string,
        failureTitle: string
    ) => {
        try {
            await api.patch(`/schedule/jobs/${move.jobId}`, {
                scheduledStart: new Date(move.start).toISOString(),
                scheduledEnd: new Date(move.end).toISOString(),
                // Explicit nulls so a drop on "Unassigned" really unassigns.
                techId: move.techId ?? null,
                vanId: move.vanId ?? null,
            });
            toast({ title: successTitle });
        } catch (err) {
            toast({ title: errorMessage(err, failureTitle), variant: "destructive" });
        } finally {
            refreshSchedule();
        }
    };

    const onBoardMove = (move: {
        jobId: string;
        start: Date | string;
        end: Date | string;
        techId?: string | null;
        vanId?: string | null;
    }) => patchSchedule(move, `Moved to ${format(new Date(move.start), "EEE d MMM, HH:mm")}`, "Could not move job");

    const onBoardDrop = (drop: {
        jobId: string;
        title: string;
        start: Date | string;
        end: Date | string;
        techId?: string | null;
        vanId?: string | null;
    }) =>
        patchSchedule(
            drop,
            drop.techId || drop.vanId
                ? `Scheduled for ${format(new Date(drop.start), "EEE d MMM, HH:mm")}`
                : "Scheduled — still unassigned",
            "Could not schedule job"
        );

    const openQuickCreate = (start: Date, lane?: { id: string; kind: BoardLane["kind"] }) => {
        const params = new URLSearchParams({
            start: start.toISOString(),
            end: new Date(start.getTime() + HOUR_MS).toISOString(),
        });
        if (lane?.kind === "tech") params.set("techId", lane.id);
        if (lane?.kind === "van") params.set("vanId", lane.id);
        router.push(`/jobs/quick?${params.toString()}`);
    };

    const onBoardSlotClick = (slot: { start: Date | string; laneId: string; kind: BoardLane["kind"] }) =>
        openQuickCreate(new Date(slot.start), { id: slot.laneId, kind: slot.kind });

    const openQuickViewById = (eventId: string, source: ScheduleEvent[]) => {
        const event = source.find((e) => e.id === eventId);
        if (event) setQuickJob(event);
        else router.push(`/jobs/${eventId}`);
    };

    // ---- Calendar ----
    const hoursRange = calendarHoursRange(businessHours);
    const calendarBusinessHours = useMemo(() => fcBusinessHours(businessHours), [businessHours]);

    const calendarEvents = useMemo(() => {
        if (!selectedTechId) return events;
        const vanIds = vanIdsByTech.get(selectedTechId);
        return events.filter(
            (e) =>
                e.extendedProps.techId === selectedTechId ||
                Boolean(e.extendedProps.vanId && vanIds?.has(e.extendedProps.vanId))
        );
    }, [events, selectedTechId, vanIdsByTech]);

    const onDatesSet = async (arg: Arg<"datesSet">) => {
        await refreshCalendar(arg.start, arg.end);
    };

    const onEventDrop = async (info: Arg<"eventDrop"> | Arg<"eventResize">) => {
        const newStart = info.event.start;
        if (!newStart) return;
        let start = newStart;
        let end = info.event.end ?? new Date(start.getTime() + HOUR_MS);
        let adjusted = false;

        // A month-view move lands on a whole day. Keep the job's original time of
        // day when it had one; otherwise use opening time on that day.
        if (info.event.allDay && isMidnight(newStart)) {
            const oldStart = info.oldEvent.start;
            const oldEnd = info.oldEvent.end;
            const duration = oldStart && oldEnd ? oldEnd.getTime() - oldStart.getTime() : HOUR_MS;
            if (oldStart && !info.oldEvent.allDay && !isMidnight(oldStart)) {
                start = new Date(newStart);
                start.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
            } else {
                start = defaultDropStart(newStart, businessHours);
            }
            end = new Date(start.getTime() + (duration > 0 ? duration : HOUR_MS));
            adjusted = true;
        }

        try {
            await api.patch(`/schedule/jobs/${info.event.id}`, {
                scheduledStart: start.toISOString(),
                scheduledEnd: end.toISOString(),
            });
            toast({ title: `Rescheduled to ${format(start, "EEE d MMM, HH:mm")}` });
            // Calendar range is refetched so an adjusted all-day drop shows its real time.
            if (adjusted) refreshSchedule();
            else {
                void fetchTodayEvents();
                if (!isSameDay(boardDateRef.current, new Date())) void fetchBoardDay(boardDateRef.current);
            }
        } catch (err) {
            // Surface the reason (e.g. backend 409 "Tech is already booked") instead
            // of silently snapping the event back with no explanation.
            info.revert();
            toast({ title: errorMessage(err, "Could not reschedule job"), variant: "destructive" });
        }
    };

    const onExternalDrop = async (info: Arg<"eventReceive">) => {
        const jobId = info.event.id;
        const title = info.event.title;
        const droppedStart = info.event.start ?? new Date();
        // Month view drops onto a whole day: book it at opening time for an hour.
        const isDayDrop = info.event.allDay || isMidnight(droppedStart);
        const start = isDayDrop ? defaultDropStart(droppedStart, businessHours) : droppedStart;
        const end = isDayDrop
            ? new Date(start.getTime() + HOUR_MS)
            : info.event.end ?? new Date(start.getTime() + HOUR_MS);
        try {
            await api.patch(`/schedule/jobs/${jobId}`, {
                scheduledStart: start.toISOString(),
                scheduledEnd: end.toISOString(),
            });
            await queryClient.invalidateQueries({ queryKey: ["unscheduled-jobs"] });
            const apiRef = calendarRef.current?.getApi();
            if (apiRef) {
                await refreshCalendar(apiRef.view.activeStart, apiRef.view.activeEnd);
            }
            void fetchTodayEvents();
            // Drop the event FullCalendar synthesised from the drag so it doesn't sit
            // beside the authoritative one we just refetched.
            info.event.remove();
            // Scheduling the time is only half the job — open the assign dialog
            // prefilled with the dropped slot so the dispatcher picks a tech in one flow.
            setReassignJob({
                id: jobId,
                title,
                start: start.toISOString(),
                end: end.toISOString(),
                extendedProps: { techId: null, vanId: null, status: "REQUESTED" },
            });
            toast({ title: "Scheduled — now assign a technician" });
        } catch (err) {
            info.event.remove();
            toast({ title: errorMessage(err, "Could not schedule job"), variant: "destructive" });
        }
    };

    const onCalendarEventClick = (info: Arg<"eventClick">) => {
        info.jsEvent.preventDefault();
        openQuickViewById(info.event.id, events);
    };

    const onCalendarSelect = (info: Arg<"select">) => {
        calendarRef.current?.getApi().unselect();
        if (!info.view.type.startsWith("timeGrid")) return;
        openQuickCreate(info.start, selectedTechId ? { id: selectedTechId, kind: "tech" } : undefined);
    };

    // Definite height: the board and calendar both scroll inside it.
    const boardHeight = isFullscreen ? "h-[calc(100vh-300px)] min-h-[420px]" : "h-[min(720px,70vh)] min-h-[420px]";

    return (
        <div
            ref={fullscreenRef}
            className={
                isFullscreen
                    ? "fixed inset-0 z-50 space-y-6 overflow-auto bg-background p-6"
                    : "space-y-6"
            }
        >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <h1 className="page-title">Dispatch Center</h1>
                    <p className="page-subtitle">
                        Plan each technician&apos;s day, monitor live field movement, and keep jobs moving.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void toggleFullscreen()}
                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen dispatch board"}
                    >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => void refreshLiveData()}>
                        <RefreshCcw className="h-4 w-4" />
                        Refresh live data
                    </Button>
                    <Button className="gap-2" onClick={() => router.push("/jobs/quick")}>
                        <CalendarClock className="h-4 w-4" />
                        New scheduled job
                    </Button>
                </div>
            </div>

            {bootstrapError && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <span>Could not load dispatch data. Check your connection and try again.</span>
                    <Button variant="outline" size="sm" onClick={() => void bootstrap()}>
                        Retry
                    </Button>
                </div>
            )}

            {isLoading && (
                <div className="text-sm text-muted-foreground">Loading dispatch data…</div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <OpsCard
                    icon={AlertOctagon}
                    label="Unscheduled"
                    value={String(unscheduledJobs.length)}
                    hint={`${emergencyCount} emergency`}
                />
                <OpsCard
                    icon={CalendarDays}
                    label="Jobs today"
                    value={String(jobsTodayCount)}
                    hint={`${completedTodayCount} completed`}
                />
                <OpsCard
                    icon={Satellite}
                    label="On the road"
                    value={`${onTheRoadCount} / ${techs.length}`}
                    hint={`${freshGpsCount} with fresh GPS`}
                />
                <OpsCard
                    icon={TimerReset}
                    label="Recurring due"
                    value={String(duePlans.length)}
                    hint="Manage plans →"
                    href="/recurring"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] 2xl:grid-cols-[280px_minmax(0,1fr)_360px]">
                <div className={isFullscreen ? "h-[calc(100vh-220px)]" : "h-[480px] xl:h-[820px]"}>
                    <UnscheduledJobsPanel
                        dragMode={view === "board" ? "native" : "fullcalendar"}
                        onJobClick={(id) => router.push(`/jobs/${id}`)}
                        onSuggestTechClick={(id) => setSuggestJobId(id)}
                    />
                </div>

                <Card className="min-w-0">
                    <CardHeader className="border-b border-border/70">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div
                                role="group"
                                aria-label="Dispatch view"
                                className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
                            >
                                <ViewButton active={view === "board"} onClick={() => setView("board")} icon={LayoutList}>
                                    Board
                                </ViewButton>
                                <ViewButton active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays}>
                                    Calendar
                                </ViewButton>
                            </div>

                            {view === "board" && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label="Previous day"
                                        onClick={() => setBoardDate((d) => addDays(d, -1))}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={boardIsToday}
                                        onClick={() => setBoardDate(startOfDay(new Date()))}
                                    >
                                        Today
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label="Next day"
                                        onClick={() => setBoardDate((d) => addDays(d, 1))}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm font-medium" aria-live="polite">
                                        {format(boardDate, "EEEE d MMM yyyy")}
                                        {!boardHours && (
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">Closed</span>
                                        )}
                                    </span>
                                </div>
                            )}

                            {view === "calendar" && selectedTech && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                    Showing {displayName(selectedTech)}
                                    <button
                                        type="button"
                                        className="rounded-full p-0.5 hover:bg-primary/20"
                                        aria-label="Show all technicians"
                                        onClick={() => setSelectedTechId(null)}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-2 md:p-3">
                        <div className={boardHeight}>
                            {view === "board" ? (
                                !boardIsToday && dayError ? (
                                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                                        <span>Could not load jobs for this day.</span>
                                        <Button variant="outline" size="sm" onClick={() => void fetchBoardDay(boardDate)}>
                                            Retry
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="relative h-full">
                                        {!boardIsToday && dayLoading && (
                                            <div className="absolute right-2 top-2 z-10 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                                                Loading…
                                            </div>
                                        )}
                                        <DispatchBoard
                                            date={boardDate}
                                            events={boardEvents}
                                            lanes={lanes}
                                            hours={boardHours}
                                            highlightLaneId={selectedTechId}
                                            onEventClick={(eventId) => openQuickViewById(eventId, boardSource)}
                                            onMove={onBoardMove}
                                            onDropUnscheduled={onBoardDrop}
                                            onSlotClick={onBoardSlotClick}
                                        />
                                    </div>
                                )
                            ) : (
                                <FullCalendar
                                    ref={calendarRef}
                                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                    initialView="timeGridWeek"
                                    firstDay={1}
                                    // SA convention: 24-hour times (no ambiguous "1:00 - 2:00").
                                    eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                    slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                    headerToolbar={{
                                        left: "prev,next today",
                                        center: "title",
                                        right: "dayGridMonth,timeGridWeek,timeGridDay",
                                    }}
                                    events={calendarEvents}
                                    editable
                                    droppable
                                    selectable
                                    selectMirror
                                    datesSet={onDatesSet}
                                    eventDrop={onEventDrop}
                                    eventResize={onEventDrop}
                                    eventReceive={onExternalDrop}
                                    eventClick={onCalendarEventClick}
                                    select={onCalendarSelect}
                                    eventContent={(arg) => {
                                        const sub =
                                            arg.event.extendedProps.techName ||
                                            arg.event.extendedProps.vanName ||
                                            "Unassigned";
                                        return (
                                            <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                                                {arg.timeText && <div className="font-semibold">{arg.timeText}</div>}
                                                <div className="truncate font-medium">{arg.event.title}</div>
                                                <div className="truncate opacity-80">{sub}</div>
                                            </div>
                                        );
                                    }}
                                    height="100%"
                                    slotMinTime={hoursRange.slotMinTime}
                                    slotMaxTime={hoursRange.slotMaxTime}
                                    businessHours={calendarBusinessHours}
                                    allDaySlot={false}
                                    nowIndicator
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="min-w-0 space-y-6">
                    <Card>
                        <CardHeader className="border-b border-border/70">
                            <CardTitle className="flex items-center gap-2">
                                <MapPinned className="h-4 w-4" />
                                Live technician map
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4">
                            <DispatchMap techPoints={techPoints} jobPoints={jobPoints} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b border-border/70">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle className="flex items-center gap-2">
                                    Tech availability
                                </CardTitle>
                                <div className="flex gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {freeCount} free
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {onSiteCount} on site
                                    </span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1.5">
                            {techRoster.length === 0 ? (
                                <p className="text-sm text-muted-foreground p-3">No technicians found.</p>
                            ) : (
                                <>
                                    <p className="px-1 pb-1 text-xs text-muted-foreground">
                                        Click a technician to see their route and filter the board.
                                    </p>
                                    {techRoster.map(({ tech, availability, current }) => {
                                        const selected = tech.id === selectedTechId;
                                        return (
                                            <button
                                                type="button"
                                                key={tech.id}
                                                aria-pressed={selected}
                                                onClick={() => setSelectedTechId(selected ? null : tech.id)}
                                                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                    selected
                                                        ? "border-primary bg-primary/10"
                                                        : "border-border/70 hover:bg-muted/50"
                                                }`}
                                            >
                                                <span className={`h-2 w-2 rounded-full ${AVAILABILITY_DOT[availability]} shrink-0`} />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm font-medium truncate">{displayName(tech)}</span>
                                                    {current && (
                                                        <span className="block text-xs text-muted-foreground truncate">{current}</span>
                                                    )}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{AVAILABILITY_LABEL[availability]}</span>
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {selectedTech && (
                        <TechRoutePanel
                            techId={selectedTech.id}
                            techName={displayName(selectedTech)}
                            date={boardDate}
                            onClose={() => setSelectedTechId(null)}
                            onStopClick={(jobId) => openQuickViewById(jobId, boardSource)}
                        />
                    )}

                    {vanTeams.length > 0 && (
                        <Card>
                            <CardHeader className="border-b border-border/70">
                                <CardTitle className="flex items-center gap-2">
                                    Van Teams
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-2">
                                {vanTeams.map((van) => {
                                    const driver = van.members.find((m) => m.role === "DRIVER");
                                    const memberCount = van.members.length;
                                    return (
                                        <div key={van.id} className="rounded-xl border border-border p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">{van.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {driver ? `${displayName(driver.user)} (driver)` : "No driver"} · {memberCount} member{memberCount !== 1 ? "s" : ""}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 text-xs text-muted-foreground">{van._count.jobs} jobs</span>
                                            </div>
                                            {van.members.length > 0 && (
                                                <div className="mt-2 flex -space-x-1">
                                                    {van.members.slice(0, 4).map((m) => (
                                                        <div key={m.id} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-medium text-foreground">
                                                            {(m.user.firstName?.[0] || m.user.email[0]).toUpperCase()}
                                                        </div>
                                                    ))}
                                                    {van.members.length > 4 && (
                                                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-medium text-muted-foreground">
                                                            +{van.members.length - 4}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <JobQuickView
                job={quickJob ? toQuickView(quickJob) : null}
                onClose={() => setQuickJob(null)}
                onReassign={() => {
                    setReassignJob(quickJob);
                    setQuickJob(null);
                }}
                onSuggestTech={(jobId) => {
                    setQuickJob(null);
                    setSuggestJobId(jobId);
                }}
            />
            <TechSuggestModal
                jobId={suggestJobId}
                onClose={() => setSuggestJobId(null)}
                onAssigned={refreshSchedule}
            />
            <ReassignDialog
                // Remount per job + slot so the dialog's fields prefill from the
                // current selection instead of keeping the first job's state.
                key={reassignJob ? `${reassignJob.id}:${reassignJob.start}` : "none"}
                open={!!reassignJob}
                onClose={() => setReassignJob(null)}
                jobId={reassignJob?.id ?? null}
                currentTechId={reassignJob?.extendedProps.techId ?? null}
                currentVanId={reassignJob?.extendedProps.vanId ?? null}
                currentStart={reassignJob?.start ?? null}
                currentEnd={reassignJob?.end ?? null}
                techs={techs.map((t) => ({ id: t.id, email: t.email, firstName: t.firstName, lastName: t.lastName }))}
                vans={vanTeams.map((v) => ({ id: v.id, name: v.name }))}
                onReassigned={refreshSchedule}
            />
        </div>
    );
}

function ViewButton({
    active,
    onClick,
    icon: Icon,
    children,
}: {
    active: boolean;
    onClick: () => void;
    icon: typeof LayoutList;
    children: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
        >
            <Icon className="h-4 w-4" />
            {children}
        </button>
    );
}

function OpsCard({
    icon: Icon,
    label,
    value,
    hint,
    href,
}: {
    icon: typeof Satellite;
    label: string;
    value: string;
    hint: string;
    href?: string;
}) {
    const body = (
        <>
            <div className="flex items-center justify-between">
                <div className="icon-tile bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                </div>
                <span className="text-2xl font-semibold tracking-tight">{value}</span>
            </div>
            <p className="mt-4 text-sm font-medium">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </>
    );
    if (href) {
        return (
            <Link
                href={href}
                className="surface-card block p-5 transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {body}
            </Link>
        );
    }
    return <div className="surface-card p-5">{body}</div>;
}
