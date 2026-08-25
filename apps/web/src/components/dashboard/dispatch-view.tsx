"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
    ArrowUpRight,
    Briefcase,
    CalendarClock,
    Inbox,
    MapPin,
    Radio,
    TriangleAlert,
} from "lucide-react";
import api from "../../lib/api";
import type { User } from "../../store/auth";
import { cn, displayName, firstNameOf } from "../../lib/utils";
import { EmptyState, StatCard, StatusPill } from "./shared";

const PRIORITY_STYLES: Record<string, string> = {
    EMERGENCY: "bg-rose-50 text-rose-700 ring-rose-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    MEDIUM: "bg-slate-50 text-slate-700 ring-slate-200",
    LOW: "bg-slate-50 text-slate-500 ring-slate-200",
};

const isToday = (value?: string | null) => {
    if (!value) return false;
    const d = new Date(value);
    const now = new Date();
    return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
    );
};

const timeOf = (value?: string | null) =>
    value
        ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
        : "Unscheduled";

/**
 * Home screen for the roles that run the day but are not allowed to see company
 * revenue (dispatchers, CSRs). The owner dashboard's analytics endpoints are
 * restricted to ADMIN/OFFICE/ACCOUNTANT, so this view is built only from
 * endpoints these roles can actually call.
 */
export function DispatchView({ user }: { user: User }) {
    const { data: jobsData } = useQuery({
        queryKey: ["dispatch-home-jobs"],
        queryFn: () => api.get("/jobs?limit=100").then((r) => r.data.data),
        refetchInterval: 60_000,
    });
    const { data: unscheduled } = useQuery({
        queryKey: ["dispatch-home-unscheduled"],
        queryFn: () => api.get("/schedule/unscheduled").then((r) => r.data.data.jobs),
        refetchInterval: 60_000,
    });
    const { data: activeTechs } = useQuery({
        queryKey: ["dispatch-home-techs"],
        queryFn: () => api.get("/tracking/active-techs").then((r) => r.data.data.techs),
        refetchInterval: 60_000,
    });
    const { data: bookings } = useQuery({
        queryKey: ["dispatch-home-bookings"],
        queryFn: () => api.get("/bookings").then((r) => r.data.data.bookings),
        refetchInterval: 60_000,
    });

    const jobs: any[] = jobsData?.items ?? [];
    const todaysJobs = jobs.filter((j) => isToday(j.scheduledStart));
    const inFlight = jobs.filter((j) => j.status === "EN_ROUTE" || j.status === "ON_SITE");
    const newBookings = (bookings ?? []).filter((b: any) => b.status === "NEW");
    const emergencies = jobs.filter(
        (j) => j.priority === "EMERGENCY" && j.status !== "COMPLETED" && j.status !== "CANCELED"
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title">Good day, {firstNameOf(user)}</h1>
                    <p className="page-subtitle">
                        Today&apos;s board — who is out, what is waiting.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/jobs/quick"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
                    >
                        New job
                    </Link>
                    <Link
                        href="/schedule"
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                        Open dispatch
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Link href="/schedule">
                    <StatCard
                        label="Scheduled today"
                        value={String(todaysJobs.length)}
                        sub={`${inFlight.length} en route or on site`}
                        icon={CalendarClock}
                        accent="bg-blue-50 text-blue-600"
                    />
                </Link>
                <Link href="/schedule">
                    <StatCard
                        label="Unassigned"
                        value={String(unscheduled?.length ?? 0)}
                        sub="Waiting for a technician"
                        icon={Briefcase}
                        accent="bg-amber-50 text-amber-600"
                    />
                </Link>
                <StatCard
                    label="Technicians out"
                    value={String(activeTechs?.length ?? 0)}
                    sub="Currently on the road"
                    icon={Radio}
                    accent="bg-violet-50 text-violet-600"
                />
                <Link href="/bookings">
                    <StatCard
                        label="New bookings"
                        value={String(newBookings.length)}
                        sub="Requests to confirm"
                        icon={Inbox}
                        accent="bg-emerald-50 text-emerald-600"
                    />
                </Link>
            </div>

            {emergencies.length > 0 && (
                <div className="surface-card border-rose-200 bg-rose-50/60 p-5">
                    <div className="flex items-center gap-2 text-rose-700">
                        <TriangleAlert className="h-4 w-4" />
                        <h3 className="font-semibold">
                            {emergencies.length} emergency job{emergencies.length > 1 ? "s" : ""} open
                        </h3>
                    </div>
                    <div className="mt-3 space-y-1">
                        {emergencies.slice(0, 4).map((job) => (
                            <Link
                                key={job.id}
                                href={`/jobs/${job.id}`}
                                className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-sm transition hover:bg-white"
                            >
                                <span className="truncate font-medium">{job.title}</span>
                                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                                    {job.customer?.name ?? "—"}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-7">
                <div className="surface-card overflow-hidden lg:col-span-4">
                    <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                        <div>
                            <h3 className="font-semibold">Today&apos;s run</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Jobs scheduled for today, earliest first
                            </p>
                        </div>
                        <Link
                            href="/schedule"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                            Schedule <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-border/60">
                        {todaysJobs.length === 0 ? (
                            <EmptyState
                                icon={CalendarClock}
                                title="Nothing booked today"
                                hint="Jobs scheduled for today will show up here."
                            />
                        ) : (
                            todaysJobs
                                .slice()
                                .sort((a, b) =>
                                    String(a.scheduledStart).localeCompare(String(b.scheduledStart))
                                )
                                .slice(0, 8)
                                .map((job) => (
                                    <Link
                                        key={job.id}
                                        href={`/jobs/${job.id}`}
                                        className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-slate-50/70"
                                    >
                                        <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                                            {timeOf(job.scheduledStart)}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{job.title}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {job.customer?.name ?? "—"} ·{" "}
                                                {job.tech ? displayName(job.tech) : "Unassigned"}
                                            </p>
                                        </div>
                                        <StatusPill status={job.status} />
                                    </Link>
                                ))
                        )}
                    </div>
                </div>

                <div className="surface-card overflow-hidden lg:col-span-3">
                    <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                        <div>
                            <h3 className="font-semibold">Waiting to assign</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                No technician on these yet
                            </p>
                        </div>
                        <Link
                            href="/schedule"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                            Assign <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-border/60">
                        {!unscheduled || unscheduled.length === 0 ? (
                            <EmptyState
                                icon={Briefcase}
                                title="Board is clear"
                                hint="Every job has a technician assigned."
                            />
                        ) : (
                            unscheduled.slice(0, 8).map((job: any) => (
                                <Link
                                    key={job.id}
                                    href={`/jobs/${job.id}`}
                                    className="block px-6 py-3 transition hover:bg-slate-50/70"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-medium">{job.title}</p>
                                        <span
                                            className={cn(
                                                "status-pill shrink-0",
                                                PRIORITY_STYLES[job.priority] ?? PRIORITY_STYLES.MEDIUM
                                            )}
                                        >
                                            {job.priority}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {job.address ?? job.customerName}
                                    </p>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
