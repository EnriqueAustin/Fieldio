"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import {
    Inbox,
    Mail,
    Phone,
    MapPin,
    Calendar,
    Sparkles,
    ArrowRight,
    Copy,
    Check,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAuthStore } from "../../../store/auth";
import { cn } from "../../../lib/utils";

type Booking = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    serviceType: string | null;
    description: string;
    preferredDate: string | null;
    status: "NEW" | "CONTACTED" | "CONVERTED" | "REJECTED";
    createdAt: string;
};

const STATUS_TONE: Record<string, string> = {
    NEW: "bg-blue-50 text-blue-700 ring-blue-200",
    CONTACTED: "bg-amber-50 text-amber-700 ring-amber-200",
    CONVERTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    REJECTED: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function BookingsPage() {
    const { user } = useAuthStore();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [filter, setFilter] = useState<string>("ALL");
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Booking | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);

    const load = async () => {
        try {
            const res = await api.get("/bookings");
            setBookings(res.data.data.bookings ?? []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const convert = async (id: string) => {
        await api.post(`/bookings/${id}/convert`);
        await load();
        setSelected(null);
    };

    const filtered = bookings.filter((b) => filter === "ALL" || b.status === filter);

    const publicLink =
        typeof window !== "undefined" && user
            ? `${window.location.origin}/book/${user.companyId}`
            : "";

    const copyLink = async () => {
        if (!publicLink) return;
        await navigator.clipboard.writeText(publicLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Booking inbox</h1>
                    <p className="page-subtitle">
                        Service requests submitted from your public booking page.
                    </p>
                </div>
                {publicLink && (
                    <button
                        onClick={copyLink}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 transition"
                    >
                        {linkCopied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" /> Link copied
                            </>
                        ) : (
                            <>
                                <Copy className="h-3.5 w-3.5" /> Copy public booking link
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="surface-card p-3 flex flex-wrap gap-1">
                {["ALL", "NEW", "CONTACTED", "CONVERTED", "REJECTED"].map((f) => {
                    const count =
                        f === "ALL" ? bookings.length : bookings.filter((b) => b.status === f).length;
                    const active = filter === f;
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                active ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100"
                            )}
                        >
                            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                            <span
                                className={cn(
                                    "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px]",
                                    active ? "bg-white/15" : "bg-slate-100 text-slate-600"
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                {/* List */}
                <div className="surface-card overflow-hidden">
                    {loading ? (
                        <div className="p-6 space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-16 px-6">
                            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Inbox className="h-5 w-5" />
                            </div>
                            <p className="mt-3 text-sm font-medium">No bookings here</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                Share your public booking link with customers and requests will appear here in real time.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/60">
                            {filtered.map((b) => (
                                <button
                                    key={b.id}
                                    onClick={() => setSelected(b)}
                                    className={cn(
                                        "w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-slate-50/70 transition",
                                        selected?.id === b.id && "bg-blue-50/40"
                                    )}
                                >
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs font-medium text-slate-700 shrink-0">
                                        {b.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="font-medium truncate">{b.name}</p>
                                            <span className="text-xs text-muted-foreground shrink-0">
                                                {formatDistanceToNow(new Date(b.createdAt), {
                                                    addSuffix: true,
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                                            {b.serviceType ? `${b.serviceType} · ` : ""}
                                            {b.description}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "status-pill",
                                                    STATUS_TONE[b.status] ?? STATUS_TONE.NEW
                                                )}
                                            >
                                                {b.status}
                                            </span>
                                            {b.preferredDate && (
                                                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(b.preferredDate), "MMM d")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail */}
                <div className="surface-card lg:sticky lg:top-24 self-start">
                    {!selected ? (
                        <div className="flex flex-col items-center text-center py-16 px-6">
                            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <p className="mt-3 text-sm font-medium">Select a booking</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Click any request to view details and convert.
                            </p>
                        </div>
                    ) : (
                        <div className="p-6 space-y-5">
                            <div>
                                <span
                                    className={cn(
                                        "status-pill",
                                        STATUS_TONE[selected.status] ?? STATUS_TONE.NEW
                                    )}
                                >
                                    {selected.status}
                                </span>
                                <h3 className="mt-3 text-lg font-semibold">{selected.name}</h3>
                                <p className="text-xs text-muted-foreground">
                                    Submitted {format(new Date(selected.createdAt), "MMM d, h:mm a")}
                                </p>
                            </div>

                            <div className="space-y-2.5 text-sm">
                                {selected.email && (
                                    <Row icon={Mail} text={selected.email} href={`mailto:${selected.email}`} />
                                )}
                                {selected.phone && (
                                    <Row icon={Phone} text={selected.phone} href={`tel:${selected.phone}`} />
                                )}
                                {(selected.addressLine1 || selected.city) && (
                                    <Row
                                        icon={MapPin}
                                        text={`${selected.addressLine1 ?? ""}${
                                            selected.city ? `, ${selected.city}` : ""
                                        } ${selected.state ?? ""} ${selected.zip ?? ""}`.trim()}
                                    />
                                )}
                                {selected.preferredDate && (
                                    <Row
                                        icon={Calendar}
                                        text={`Preferred: ${format(
                                            new Date(selected.preferredDate),
                                            "EEE MMM d, h:mm a"
                                        )}`}
                                    />
                                )}
                            </div>

                            {selected.serviceType && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Service type
                                    </p>
                                    <p className="text-sm mt-1">{selected.serviceType}</p>
                                </div>
                            )}

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Description
                                </p>
                                <p className="mt-1 text-sm leading-relaxed bg-slate-50 rounded-lg p-3 border border-border/60">
                                    {selected.description}
                                </p>
                            </div>

                            {selected.status !== "CONVERTED" && (
                                <button
                                    onClick={() => convert(selected.id)}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition"
                                >
                                    Convert to job
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({
    icon: Icon,
    text,
    href,
}: {
    icon: any;
    text: string;
    href?: string;
}) {
    const inner = (
        <span className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{text}</span>
        </span>
    );
    return href ? (
        <a href={href} className="block hover:text-foreground transition">
            {inner}
        </a>
    ) : (
        <div>{inner}</div>
    );
}
