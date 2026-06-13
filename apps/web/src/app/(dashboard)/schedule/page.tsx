"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, isSameDay, startOfWeek, endOfWeek } from "date-fns";
import { CalendarClock, MapPinned, RefreshCcw, Route, Satellite, ShieldCheck, TimerReset } from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { StatusPill } from "../../../components/ui/status-pill";
import { DispatchMap } from "../../../components/schedule/dispatch-map";
import { UnscheduledJobsPanel } from "../../../components/schedule/unscheduled-jobs-panel";
import { TechSuggestModal } from "../../../components/schedule/tech-suggest-modal";
import { ReassignDialog } from "../../../components/schedule/reassign-dialog";
import { toast } from "../../../components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../../../store/auth";
import { useRouter } from "next/navigation";

type CalendarEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    extendedProps: {
        customerId?: string;
        techId?: string | null;
        vanId?: string | null;
        status: string;
        address?: string;
    };
};

type Technician = {
    id: string;
    email: string;
    role: string;
    status: string;
};

type VanTeam = {
    id: string;
    name: string;
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

type RecurringPlan = {
    id: string;
    title: string;
    frequency: string;
    nextRunAt: string;
    active: boolean;
    isDue: boolean;
    customer: { id: string; name: string } | null;
    property: { id: string; addressLine1: string; city: string } | null;
};

type Customer = {
    id: string;
    name: string;
};

type Property = {
    id: string;
    customerId: string;
    addressLine1: string;
    city: string;
    geoLat?: number | null;
    geoLng?: number | null;
};

const frequencyOptions = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;

const emptyForm = {
    customerId: "",
    propertyId: "",
    title: "",
    description: "",
    frequency: "MONTHLY",
    startDate: "",
};

export default function SchedulePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { accessToken } = useAuthStore();
    const calendarRef = useRef<FullCalendar | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const [suggestJobId, setSuggestJobId] = useState<string | null>(null);
    const [reassignJob, setReassignJob] = useState<CalendarEvent | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [techs, setTechs] = useState<Technician[]>([]);
    const [pings, setPings] = useState<LivePing[]>([]);
    const [vanTeams, setVanTeams] = useState<VanTeam[]>([]);
    const [plans, setPlans] = useState<RecurringPlan[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [rangeLabel, setRangeLabel] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [planForm, setPlanForm] = useState(emptyForm);

    const refreshCalendar = async (start: Date, end: Date) => {
        const response = await api.get("/schedule/events", {
            params: {
                start: start.toISOString(),
                end: end.toISOString(),
            },
        });
        setEvents(response.data.data.events);
        setRangeLabel(`${format(start, "d MMM")} - ${format(end, "d MMM")}`);
    };

    const refreshOperations = async () => {
        const [usersRes, trackingRes, plansRes, customersRes, propertiesRes, vansRes] = await Promise.all([
            api.get("/users"),
            api.get("/tracking/latest"),
            api.get("/recurring"),
            api.get("/customers", { params: { page: 1, limit: 100 } }),
            api.get("/operations/properties"),
            api.get("/vans").catch(() => ({ data: { data: { vans: [] } } })),
        ]);

        setTechs(usersRes.data.data.users.filter((user: Technician) => user.role === "TECHNICIAN"));
        setPings(trackingRes.data.data.pings);
        setVanTeams((vansRes.data.data.vans ?? []).filter((v: any) => v.active));
        setPlans(plansRes.data.data.plans);
        setCustomers(customersRes.data.data.items.map((item: any) => ({ id: item.id, name: item.name })));
        setProperties(propertiesRes.data.data.properties);
    };

    useEffect(() => {
        const bootstrap = async () => {
            setIsLoading(true);
            try {
                const start = startOfWeek(new Date(), { weekStartsOn: 1 });
                const end = endOfWeek(new Date(), { weekStartsOn: 1 });
                await Promise.all([refreshCalendar(start, end), refreshOperations()]);
            } finally {
                setIsLoading(false);
            }
        };

        void bootstrap();
    }, []);

    useEffect(() => {
        if (!accessToken) return;

        const socketUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        socketRef.current = io(socketUrl, {
            auth: { token: accessToken },
            path: "/socket.io",
            withCredentials: true,
        });

        const syncCalendar = () => {
            const apiRef = calendarRef.current?.getApi();
            if (!apiRef) return;
            void refreshCalendar(apiRef.view.activeStart, apiRef.view.activeEnd);
        };

        socketRef.current.on("job:created", syncCalendar);
        socketRef.current.on("schedule:updated", syncCalendar);
        socketRef.current.on("tech:location", () => {
            void refreshOperations();
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, [accessToken]);

    const visibleProperties = useMemo(
        () => properties.filter((property) => !planForm.customerId || property.customerId === planForm.customerId),
        [planForm.customerId, properties]
    );

    const unassignedJobs = events.filter((event) => !event.extendedProps.techId);
    const activeTechs = pings.filter((ping) => ping.activeJob && !ping.isStale);
    const duePlans = plans.filter((plan) => plan.isDue && plan.active);
    const todayJobs = events.filter((event) => isSameDay(new Date(event.start), new Date()));

    type Availability = "FREE" | "EN_ROUTE" | "ON_SITE" | "BUSY" | "OFFLINE";
    const techRoster: { tech: Technician; availability: Availability; current?: string }[] = useMemo(() => {
        return techs.map((tech) => {
            const ping = pings.find((p) => p.userId === tech.id);
            const activeStatus = ping?.activeJob?.status;
            const todayCount = events.filter(
                (e) => e.extendedProps.techId === tech.id && isSameDay(new Date(e.start), new Date())
            ).length;
            let availability: Availability = "FREE";
            let current: string | undefined;
            if (!ping || ping.isStale) {
                availability = "OFFLINE";
            } else if (activeStatus === "EN_ROUTE") {
                availability = "EN_ROUTE";
                current = ping.activeJob?.customerName;
            } else if (activeStatus === "ON_SITE") {
                availability = "ON_SITE";
                current = ping.activeJob?.customerName;
            } else if (todayCount > 0) {
                availability = "BUSY";
                current = `${todayCount} job${todayCount !== 1 ? "s" : ""} today`;
            }
            return { tech, availability, current };
        });
    }, [techs, pings, events]);

    const freeCount = techRoster.filter((r) => r.availability === "FREE").length;
    const onSiteCount = techRoster.filter((r) => r.availability === "ON_SITE").length;

    const techPoints = activeTechs.map((ping) => ({
        id: ping.id,
        label: ping.user.email.split("@")[0],
        lat: ping.lat,
        lng: ping.lng,
        tone: "tech" as const,
    }));

    const jobPoints = activeTechs
        .filter((ping) => ping.activeJob?.destination)
        .map((ping) => ({
            id: ping.activeJob!.id,
            label: ping.activeJob!.customerName,
            lat: ping.activeJob!.destination!.lat,
            lng: ping.activeJob!.destination!.lng,
            tone: "job" as const,
        }));

    const onDatesSet = async (arg: { start: Date; end: Date }) => {
        await refreshCalendar(arg.start, arg.end);
    };

    const onEventDrop = async (info: any) => {
        try {
            await api.patch(`/schedule/jobs/${info.event.id}`, {
                scheduledStart: info.event.start,
                scheduledEnd: info.event.end,
            });
            toast({ title: `Rescheduled to ${format(info.event.start, "EEE d MMM, p")}` });
        } catch (err: any) {
            // Surface the reason (e.g. backend 409 "Tech is already booked") instead
            // of silently snapping the event back with no explanation.
            info.revert();
            toast({
                title: err?.response?.data?.message ?? "Could not reschedule job",
                variant: "destructive",
            });
        }
    };

    const onExternalDrop = async (info: any) => {
        const jobId = info.event.id;
        const start = info.event.start as Date;
        const end =
            info.event.end ?? new Date(start.getTime() + 60 * 60 * 1000);
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
            // Scheduling the time is only half the job — open the assign dialog
            // prefilled with the dropped slot so the dispatcher picks a tech in one flow.
            setReassignJob({
                id: jobId,
                title: info.event.title,
                start: start.toISOString(),
                end: end.toISOString(),
                extendedProps: { techId: null, vanId: null, status: "REQUESTED" },
            });
            toast({ title: "Scheduled — now assign a technician" });
        } catch (err: any) {
            info.event.remove();
            toast({
                title: err?.response?.data?.message ?? "Could not schedule job",
                variant: "destructive",
            });
        }
    };

    const onEventClick = (info: any) => {
        const event = {
            id: info.event.id,
            title: info.event.title,
            start: info.event.startStr,
            end: info.event.endStr,
            extendedProps: {
                techId: info.event.extendedProps?.techId ?? null,
                vanId: info.event.extendedProps?.vanId ?? null,
                status: info.event.extendedProps?.status,
                customerId: info.event.extendedProps?.customerId,
                address: info.event.extendedProps?.address,
            },
        } as CalendarEvent;
        setReassignJob(event);
    };

    const createPlan = async () => {
        if (!planForm.customerId || !planForm.propertyId || !planForm.title || !planForm.startDate) return;

        setIsSavingPlan(true);
        try {
            await api.post("/recurring", {
                customerId: planForm.customerId,
                propertyId: planForm.propertyId,
                title: planForm.title,
                description: planForm.description || undefined,
                frequency: planForm.frequency,
                startDate: new Date(planForm.startDate).toISOString(),
            });
            setPlanForm(emptyForm);
            await refreshOperations();
        } finally {
            setIsSavingPlan(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <h1 className="page-title">Dispatch Center</h1>
                    <p className="page-subtitle">
                        Coordinate your team, monitor live field movement, and keep recurring work on track.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => void refreshOperations()}>
                        <RefreshCcw className="h-4 w-4" />
                        Refresh live data
                    </Button>
                    <Button className="gap-2" onClick={() => router.push("/jobs/quick")}>
                        <CalendarClock className="h-4 w-4" />
                        New scheduled job
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <OpsCard icon={Route} label="Unassigned jobs" value={String(unassignedJobs.length)} hint="Needs dispatcher action" />
                <OpsCard icon={Satellite} label="Live technicians" value={String(activeTechs.length)} hint="Fresh pings in last 15 min" />
                <OpsCard icon={TimerReset} label="Recurring due" value={String(duePlans.length)} hint="Plans ready to generate" />
                <OpsCard icon={ShieldCheck} label="Week range" value={rangeLabel || "Current week"} hint={`${todayJobs.length} jobs scheduled today`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1.4fr)_minmax(320px,0.95fr)]">
                <div className="h-[480px] xl:h-[820px]">
                    <UnscheduledJobsPanel
                        onJobClick={(id) => router.push(`/jobs/${id}`)}
                        onSuggestTechClick={(id) => setSuggestJobId(id)}
                    />
                </div>
                <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border/70">
                        <CardTitle>Calendar board</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 md:p-3">
                        <div className="h-[560px] xl:h-[720px]">
                            <FullCalendar
                                ref={calendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView="timeGridWeek"
                                headerToolbar={{
                                    left: "prev,next today",
                                    center: "title",
                                    right: "dayGridMonth,timeGridWeek,timeGridDay",
                                }}
                                events={events}
                                editable
                                droppable
                                selectable
                                datesSet={onDatesSet}
                                eventDrop={onEventDrop}
                                eventResize={onEventDrop}
                                eventReceive={onExternalDrop}
                                eventClick={onEventClick}
                                height="100%"
                                slotMinTime="06:00:00"
                                slotMaxTime="20:00:00"
                                allDaySlot={false}
                                nowIndicator
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
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
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    Tech availability
                                </CardTitle>
                                <div className="flex gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {freeCount} free
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {onSiteCount} on site
                                    </span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1.5">
                            {techRoster.length === 0 ? (
                                <p className="text-sm text-muted-foreground p-3">No technicians found.</p>
                            ) : (
                                techRoster.map(({ tech, availability, current }) => {
                                    const tone = {
                                        FREE: "bg-emerald-500",
                                        EN_ROUTE: "bg-violet-500",
                                        ON_SITE: "bg-amber-500",
                                        BUSY: "bg-blue-500",
                                        OFFLINE: "bg-slate-300",
                                    }[availability];
                                    const label = {
                                        FREE: "Available",
                                        EN_ROUTE: "En route",
                                        ON_SITE: "On site",
                                        BUSY: "Scheduled",
                                        OFFLINE: "Offline",
                                    }[availability];
                                    return (
                                        <div key={tech.id} className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2">
                                            <span className={`h-2 w-2 rounded-full ${tone} shrink-0`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{tech.email.split("@")[0]}</p>
                                                {current && (
                                                    <p className="text-xs text-muted-foreground truncate">{current}</p>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">{label}</span>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

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
                                                <div>
                                                    <p className="text-sm font-medium">{van.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {driver ? `${[driver.user.firstName, driver.user.lastName].filter(Boolean).join(" ") || driver.user.email.split("@")[0]} (driver)` : "No driver"} · {memberCount} member{memberCount !== 1 ? "s" : ""}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{van._count.jobs} jobs</span>
                                            </div>
                                            {van.members.length > 0 && (
                                                <div className="mt-2 flex -space-x-1">
                                                    {van.members.slice(0, 4).map((m) => (
                                                        <div key={m.id} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 border-2 border-white text-[9px] font-medium text-slate-700">
                                                            {(m.user.firstName?.[0] || m.user.email[0]).toUpperCase()}
                                                        </div>
                                                    ))}
                                                    {van.members.length > 4 && (
                                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 border-2 border-white text-[9px] font-medium text-slate-600">
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

                    <Card>
                        <CardHeader className="border-b border-border/70">
                            <CardTitle>Recurring maintenance plans</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5 p-4">
                            <div className="grid gap-3">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="customerId">Customer</Label>
                                    <select
                                        id="customerId"
                                        className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                                        value={planForm.customerId}
                                        onChange={(event) =>
                                            setPlanForm((current) => ({
                                                ...current,
                                                customerId: event.target.value,
                                                propertyId: "",
                                            }))
                                        }
                                    >
                                        <option value="">Select customer</option>
                                        {customers.map((customer) => (
                                            <option key={customer.id} value={customer.id}>
                                                {customer.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="propertyId">Property</Label>
                                    <select
                                        id="propertyId"
                                        className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                                        value={planForm.propertyId}
                                        onChange={(event) =>
                                            setPlanForm((current) => ({
                                                ...current,
                                                propertyId: event.target.value,
                                            }))
                                        }
                                    >
                                        <option value="">Select property</option>
                                        {visibleProperties.map((property) => (
                                            <option key={property.id} value={property.id}>
                                                {property.addressLine1}, {property.city}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="title">Plan title</Label>
                                    <Input
                                        id="title"
                                        value={planForm.title}
                                        onChange={(event) =>
                                            setPlanForm((current) => ({ ...current, title: event.target.value }))
                                        }
                                        placeholder="Quarterly HVAC preventive service"
                                    />
                                </div>

                                <div className="grid gap-1.5 md:grid-cols-2">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="frequency">Frequency</Label>
                                        <select
                                            id="frequency"
                                            className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                                            value={planForm.frequency}
                                            onChange={(event) =>
                                                setPlanForm((current) => ({
                                                    ...current,
                                                    frequency: event.target.value,
                                                }))
                                            }
                                        >
                                            {frequencyOptions.map((option) => (
                                                <option key={option} value={option}>
                                                    {option.replace("_", " ")}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid gap-1.5">
                                        <Label htmlFor="startDate">Start date</Label>
                                        <Input
                                            id="startDate"
                                            type="datetime-local"
                                            value={planForm.startDate}
                                            onChange={(event) =>
                                                setPlanForm((current) => ({
                                                    ...current,
                                                    startDate: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="description">Notes</Label>
                                    <Textarea
                                        id="description"
                                        value={planForm.description}
                                        onChange={(event) =>
                                            setPlanForm((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                        placeholder="Include filter replacement, coil clean, and safety checklist."
                                    />
                                </div>

                                <Button className="w-full" onClick={() => void createPlan()} disabled={isSavingPlan}>
                                    {isSavingPlan ? "Saving plan..." : "Create recurring plan"}
                                </Button>
                            </div>

                            <div className="space-y-2 border-t border-border pt-4">
                                {plans.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No recurring plans created yet.</p>
                                ) : (
                                    plans.map((plan) => (
                                        <div key={plan.id} className="rounded-xl border border-border bg-slate-50/70 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium">{plan.title}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {plan.customer?.name} · {plan.property?.addressLine1}
                                                    </p>
                                                </div>
                                                <StatusPill status={plan.isDue ? "ON_SITE" : "ASSIGNED"} />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                                                <span>{plan.frequency.toLowerCase()}</span>
                                                <span>Next run {format(new Date(plan.nextRunAt), "d MMM yyyy")}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading dispatch data...</div>
            ) : null}

            <TechSuggestModal jobId={suggestJobId} onClose={() => setSuggestJobId(null)} />
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
                techs={techs.map((t) => ({ id: t.id, email: t.email }))}
                vans={vanTeams.map((v) => ({ id: v.id, name: v.name }))}
                onReassigned={() => {
                    const apiRef = calendarRef.current?.getApi();
                    if (apiRef) void refreshCalendar(apiRef.view.activeStart, apiRef.view.activeEnd);
                }}
            />
        </div>
    );
}

function OpsCard({
    icon: Icon,
    label,
    value,
    hint,
}: {
    icon: typeof Route;
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <div className="surface-card p-5">
            <div className="flex items-center justify-between">
                <div className="icon-tile bg-slate-100 text-slate-700">
                    <Icon className="h-5 w-5" />
                </div>
                <span className="text-2xl font-semibold tracking-tight">{value}</span>
            </div>
            <p className="mt-4 text-sm font-medium">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}
