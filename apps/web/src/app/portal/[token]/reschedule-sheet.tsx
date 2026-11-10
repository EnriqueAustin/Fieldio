"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, CalendarCheck2, CalendarX2, Loader2 } from "lucide-react";
import { API_BASE, CallLink, PortalSheet } from "./portal-shared";

type IneligibleReason = "DISABLED" | "STATUS" | "NOT_SCHEDULED" | "TOO_LATE" | "LIMIT_REACHED";

interface Slot { start: string; end: string }

interface RescheduleInfo {
    eligible: boolean;
    reason: IneligibleReason | null;
    contactPhone: string | null;
    timeZone: string;
    current: { start: string | null; end: string | null } | null;
    durationMinutes: number;
    slots: Slot[];
}

const REASON_TEXT: Record<IneligibleReason, string> = {
    DISABLED: "Online rescheduling isn't available for this booking.",
    STATUS: "This job is already under way, so it can't be moved online.",
    NOT_SCHEDULED: "This job doesn't have a booked time yet — we'll be in touch to arrange one.",
    TOO_LATE: "This visit is too close to change online.",
    LIMIT_REACHED: "This visit has already been rescheduled the maximum number of times online.",
};

const DEFAULT_TZ = "Africa/Johannesburg";

/** Formats a scheduled window, e.g. "Tue 4 Nov · 09:00–11:00". */
export function formatWindow(start: string, end: string | null, timeZone = DEFAULT_TZ) {
    const day = new Intl.DateTimeFormat("en-ZA", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(start));
    const t = new Intl.DateTimeFormat("en-ZA", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} · ${t.format(new Date(start))}${end ? `–${t.format(new Date(end))}` : ""}`;
}

export function RescheduleSheet({ token, job, companyPhone, onClose, onDone }: {
    token: string;
    job: { id: string; title: string; scheduledStart: string | null; scheduledEnd: string | null };
    companyPhone: string | null;
    onClose: () => void;
    onDone: () => void;
}) {
    const [info, setInfo] = useState<RescheduleInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Slot | null>(null);
    const [step, setStep] = useState<"pick" | "confirm" | "done">("pick");
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const fetchSlots = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const r = await fetch(`${API_BASE}/public/portal/${token}/jobs/${job.id}/reschedule`);
            if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Could not load available times");
            setInfo((await r.json()).data);
        } catch (e: any) {
            setLoadError(e.message);
        } finally {
            setLoading(false);
        }
    }, [token, job.id]);

    useEffect(() => { fetchSlots(); }, [fetchSlots]);

    const tz = info?.timeZone || DEFAULT_TZ;
    const phone = info?.contactPhone || companyPhone;

    const days = useMemo(() => {
        if (!info) return [];
        const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
        const labelFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
        const groups = new Map<string, { label: string; slots: Slot[] }>();
        for (const s of info.slots) {
            const d = new Date(s.start);
            const key = keyFmt.format(d);
            if (!groups.has(key)) groups.set(key, { label: labelFmt.format(d), slots: [] });
            groups.get(key)!.slots.push(s);
        }
        return [...groups.values()];
    }, [info, tz]);

    const timeFmt = useMemo(
        () => new Intl.DateTimeFormat("en-ZA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }),
        [tz],
    );

    const confirm = async () => {
        if (!selected) return;
        setSubmitting(true);
        setNotice(null);
        try {
            const r = await fetch(`${API_BASE}/public/portal/${token}/jobs/${job.id}/reschedule`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start: selected.start }),
            });
            if (r.status === 409) {
                const msg = (await r.json().catch(() => null))?.message || "That time is no longer available.";
                setNotice(`${msg} Please pick another time.`);
                setSelected(null);
                setStep("pick");
                await fetchSlots();
                return;
            }
            if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Could not reschedule");
            setStep("done");
            onDone();
        } catch (e: any) {
            setNotice(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const currentStart = info?.current?.start ?? job.scheduledStart;
    const currentEnd = info?.current?.end ?? job.scheduledEnd;

    return (
        <PortalSheet title="Reschedule visit" subtitle={job.title} onClose={onClose}>
            {loading && !info && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Finding available times…
                </div>
            )}

            {loadError && !info && (
                <div className="space-y-3 py-2">
                    <p className="text-sm text-rose-600">{loadError}</p>
                    <button onClick={fetchSlots} className="w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-slate-50">Try again</button>
                    {phone && <CallLink phone={phone} />}
                </div>
            )}

            {info && !info.eligible && (
                <div className="space-y-4 py-2">
                    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                        <CalendarX2 className="h-5 w-5 shrink-0 text-slate-500" />
                        <p className="text-sm text-slate-700">
                            {(info.reason && REASON_TEXT[info.reason]) || "This visit can't be rescheduled online."}
                            {phone ? " Give us a call and we'll sort it out." : " Please contact us to change it."}
                        </p>
                    </div>
                    {phone && <CallLink phone={phone} />}
                </div>
            )}

            {info?.eligible && step === "done" && selected && (
                <div className="space-y-4 py-2 text-center">
                    <CalendarCheck2 className="mx-auto h-12 w-12 text-emerald-500" />
                    <div>
                        <p className="font-semibold">You&apos;re rebooked</p>
                        <p className="text-sm text-muted-foreground mt-1">{formatWindow(selected.start, selected.end, tz)}</p>
                    </div>
                    <button onClick={onClose} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">Done</button>
                </div>
            )}

            {info?.eligible && step === "confirm" && selected && (
                <div className="space-y-4 py-2">
                    <div className="rounded-xl border border-border p-4 space-y-2">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">Current</p>
                            <p className="text-sm text-slate-500 line-through">
                                {currentStart ? formatWindow(currentStart, currentEnd, tz) : "Not set"}
                            </p>
                        </div>
                        <ArrowDown className="h-4 w-4 text-slate-400" />
                        <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">New time</p>
                            <p className="font-semibold text-emerald-700">{formatWindow(selected.start, selected.end, tz)}</p>
                        </div>
                    </div>
                    {notice && <p className="text-sm text-rose-600">{notice}</p>}
                    <button
                        onClick={confirm}
                        disabled={submitting}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Rebooking…</> : "Confirm new time"}
                    </button>
                    <button
                        onClick={() => { setStep("pick"); setNotice(null); }}
                        disabled={submitting}
                        className="w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-slate-50"
                    >
                        Pick a different time
                    </button>
                </div>
            )}

            {info?.eligible && step === "pick" && (
                <div className="space-y-4 py-1">
                    {currentStart && (
                        <p className="text-sm text-muted-foreground">
                            Currently booked: <span className="font-medium text-slate-900">{formatWindow(currentStart, currentEnd, tz)}</span>
                        </p>
                    )}
                    {notice && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
                    {loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing times…</p>}

                    {days.length === 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-700">
                                There are no open times online right now.{phone ? " Call us and we'll find a time that suits you." : " Please contact us to arrange a new time."}
                            </p>
                            {phone && <CallLink phone={phone} />}
                        </div>
                    ) : (
                        days.map(day => (
                            <div key={day.label}>
                                <p className="text-sm font-medium text-slate-900 mb-2">{day.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {day.slots.map(s => {
                                        const active = selected?.start === s.start;
                                        return (
                                            <button
                                                key={s.start}
                                                onClick={() => setSelected(s)}
                                                aria-pressed={active}
                                                className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${active
                                                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600"
                                                    : "border-border bg-white text-slate-700 hover:bg-slate-50"}`}
                                            >
                                                {timeFmt.format(new Date(s.start))}–{timeFmt.format(new Date(s.end))}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}

                    {days.length > 0 && (
                        <div className="sticky bottom-0 -mx-5 border-t border-border bg-white px-5 pt-3">
                            <button
                                onClick={() => { setStep("confirm"); setNotice(null); }}
                                disabled={!selected}
                                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {selected ? `Continue with ${formatWindow(selected.start, selected.end, tz)}` : "Pick a time"}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </PortalSheet>
    );
}
