"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, MapPin, Phone, Truck, User, XCircle } from "lucide-react";
import { TrackerMap } from "./tracker-map";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const POLL_MS = 20_000;

type JobStatus = "REQUESTED" | "ASSIGNED" | "EN_ROUTE" | "ON_SITE" | "PAUSED" | "COMPLETED" | "CANCELED";

/** Shape of GET /public/track/:token (scheduling.service getTracking). */
interface TrackerData {
    job: {
        id: string;
        title: string;
        status: JobStatus;
        scheduledStart: string | null;
        techName: string;
        techAvatar: string | null;
    };
    customer: { name: string } | null;
    property: { addressLine1: string; city: string; geoLat: number | null; geoLng: number | null } | null;
    company: { name: string | null; phone: string | null };
    /** Only sent while the job is EN_ROUTE. */
    techLocation: { lat: number; lng: number; createdAt: string; ageSeconds: number } | null;
    etaMinutes: number | null;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "not-found" }
    | { kind: "error" }
    | { kind: "ready"; data: TrackerData; fetchedAt: number };

const FINISHED: JobStatus[] = ["COMPLETED", "CANCELED"];

function formatEta(minutes: number) {
    if (minutes < 60) return `about ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `about ${hours} h ${rest} min` : `about ${hours} h`;
}

function formatAge(seconds: number) {
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}

function useTracker(token: string | undefined) {
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    const load = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API}/public/track/${encodeURIComponent(token)}`, { cache: "no-store" });
            if (res.status === 404) {
                setState({ kind: "not-found" });
                return;
            }
            if (!res.ok) throw new Error(`Tracker request failed (${res.status})`);
            const json = (await res.json()) as { data?: TrackerData };
            if (!json.data) throw new Error("Tracker response had no data");
            setState({ kind: "ready", data: json.data, fetchedAt: Date.now() });
        } catch {
            // Keep the last good data on a failed refresh (patchy mobile signal).
            setState((prev) => (prev.kind === "ready" ? prev : { kind: "error" }));
        }
    }, [token]);

    const status = state.kind === "ready" ? state.data.job.status : null;
    const finished = status !== null && FINISHED.includes(status);
    const stopped = state.kind === "not-found" || finished;

    useEffect(() => {
        void load();
    }, [load]);

    // Poll only while the page is visible and the visit is still live.
    useEffect(() => {
        if (stopped) return;
        let timer: ReturnType<typeof setInterval> | null = null;
        const start = () => {
            if (timer === null) timer = setInterval(() => void load(), POLL_MS);
        };
        const stop = () => {
            if (timer !== null) clearInterval(timer);
            timer = null;
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                void load();
                start();
            } else {
                stop();
            }
        };
        if (document.visibilityState === "visible") start();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [load, stopped]);

    return { state, retry: load };
}

/** Re-renders periodically so "updated x min ago" keeps counting between polls. */
function useNow(intervalMs: number) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export default function TrackerPage() {
    const { token } = useParams<{ token: string }>();
    const { state, retry } = useTracker(token);
    const now = useNow(15_000);

    if (state.kind === "loading") {
        return (
            <Shell>
                <Card>
                    <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-6 w-48 animate-pulse rounded bg-slate-200" />
                    <p className="sr-only" role="status">Loading your tracking page…</p>
                </Card>
            </Shell>
        );
    }

    if (state.kind === "not-found") {
        return (
            <Shell>
                <Card>
                    <h1 className="text-lg font-semibold">This tracking link isn&apos;t valid</h1>
                    <p className="mt-1 text-sm text-slate-600">
                        It may have expired. Please contact the company that sent you the link.
                    </p>
                </Card>
            </Shell>
        );
    }

    if (state.kind === "error") {
        return (
            <Shell>
                <Card>
                    <h1 className="text-lg font-semibold">We couldn&apos;t load your update</h1>
                    <p className="mt-1 text-sm text-slate-600">Check your connection and try again.</p>
                    <button
                        type="button"
                        onClick={() => void retry()}
                        className="mt-4 inline-flex h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    >
                        Try again
                    </button>
                </Card>
            </Shell>
        );
    }

    return <TrackerView data={state.data} ageOffsetSeconds={Math.max(0, Math.round((now - state.fetchedAt) / 1000))} />;
}

function TrackerView({ data, ageOffsetSeconds }: { data: TrackerData; ageOffsetSeconds: number }) {
    const { job, customer, property, company, techLocation, etaMinutes } = data;
    const techLabel = job.techName || "Your technician";
    const companyName = company.name ?? "Your service provider";
    const home = useMemo(
        () =>
            property?.geoLat != null && property.geoLng != null ? { lat: property.geoLat, lng: property.geoLng } : null,
        [property?.geoLat, property?.geoLng]
    );
    const address = property ? [property.addressLine1, property.city].filter(Boolean).join(", ") : null;

    return (
        <Shell>
            <Card>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{companyName}</div>
                <h1 className="mt-1 text-lg font-semibold">{job.title}</h1>
                {customer?.name ? (
                    <p className="mt-0.5 text-sm text-slate-600">Hi {customer.name}, here&apos;s your live update.</p>
                ) : null}
            </Card>

            <StatusHero
                status={job.status}
                techLabel={techLabel}
                companyName={companyName}
                etaMinutes={etaMinutes}
                hasFix={techLocation !== null}
            />

            {job.status === "EN_ROUTE" && techLocation ? (
                <Card padded={false}>
                    <TrackerMap tech={{ lat: techLocation.lat, lng: techLocation.lng, label: techLabel }} home={home} />
                    <p className="px-4 py-3 text-xs text-slate-500" aria-live="polite">
                        Location updated {formatAge(techLocation.ageSeconds + ageOffsetSeconds)}
                    </p>
                </Card>
            ) : null}

            <Card>
                <dl className="space-y-3">
                    <Row icon={<User className="h-4 w-4" />} label="Technician" value={job.techName || "Being assigned"} />
                    {job.scheduledStart ? (
                        <Row
                            icon={<Clock className="h-4 w-4" />}
                            label="Scheduled"
                            value={new Date(job.scheduledStart).toLocaleString("en-ZA", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        />
                    ) : null}
                    {address ? <Row icon={<MapPin className="h-4 w-4" />} label="Address" value={address} /> : null}
                </dl>
            </Card>

            {company.phone ? (
                <a
                    href={`tel:${company.phone.replace(/\s+/g, "")}`}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Call {companyName}
                </a>
            ) : null}

            <p className="text-center text-xs text-slate-400">Powered by Fieldio</p>
        </Shell>
    );
}

function StatusHero({
    status,
    techLabel,
    companyName,
    etaMinutes,
    hasFix,
}: {
    status: JobStatus;
    techLabel: string;
    companyName: string;
    etaMinutes: number | null;
    hasFix: boolean;
}) {
    if (status === "EN_ROUTE") {
        return (
            <section className="rounded-xl bg-violet-600 p-5 text-white shadow-sm" data-testid="tracker-eta" aria-live="polite">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-100">
                    <Truck className="h-4 w-4" aria-hidden="true" />
                    On the way
                </div>
                <p className="mt-1 text-2xl font-semibold">
                    {etaMinutes !== null ? `Arriving in ${formatEta(etaMinutes)}` : `${techLabel} is on the way`}
                </p>
                <p className="mt-1 text-sm text-violet-100">
                    {etaMinutes !== null
                        ? "Estimate only, it may change with traffic."
                        : hasFix
                        ? "We'll show an arrival time as soon as we get a fresh location."
                        : "Waiting for your technician's location. This page updates by itself."}
                </p>
            </section>
        );
    }

    if (status === "ON_SITE") {
        return (
            <Hero tone="emerald" icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} title="Your technician has arrived">
                {techLabel === "Your technician" ? "They're" : `${techLabel} is`} on site and getting started.
            </Hero>
        );
    }

    if (status === "PAUSED") {
        return (
            <Hero tone="amber" icon={<Clock className="h-5 w-5" aria-hidden="true" />} title="Work is paused">
                Your technician will be back to finish the job. We&apos;ll update you when they&apos;re on the way.
            </Hero>
        );
    }

    if (status === "COMPLETED") {
        return (
            <Hero tone="emerald" icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} title="Job complete">
                Thanks for choosing {companyName}. You&apos;ll receive a summary of the work shortly.
            </Hero>
        );
    }

    if (status === "CANCELED") {
        return (
            <Hero tone="slate" icon={<XCircle className="h-5 w-5" aria-hidden="true" />} title="This visit was cancelled">
                Please contact {companyName} if you have any questions.
            </Hero>
        );
    }

    // REQUESTED / ASSIGNED: booked, not yet driving.
    return (
        <Hero tone="slate" icon={<Clock className="h-5 w-5" aria-hidden="true" />} title="Your visit is booked">
            You&apos;ll see your technician on the map here once they&apos;re on the way.
        </Hero>
    );
}

const HERO_TONES = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-white text-slate-900",
} as const;

function Hero({
    tone,
    icon,
    title,
    children,
}: {
    tone: keyof typeof HERO_TONES;
    icon: ReactNode;
    title: string;
    children: ReactNode;
}) {
    return (
        <section className={`rounded-xl border p-5 shadow-sm ${HERO_TONES[tone]}`} aria-live="polite">
            <div className="flex items-center gap-2">
                {icon}
                <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <p className="mt-1 text-sm opacity-90">{children}</p>
        </section>
    );
}

function Shell({ children }: { children: ReactNode }) {
    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto max-w-md space-y-4 px-4 py-4 sm:py-8">{children}</div>
        </main>
    );
}

function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
    return (
        <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${padded ? "p-5" : ""}`}>{children}</div>
    );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <div className="mt-0.5 text-slate-400" aria-hidden="true">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <dt className="text-xs uppercase text-slate-400">{label}</dt>
                <dd className="break-words text-sm font-medium">{value}</dd>
            </div>
        </div>
    );
}
