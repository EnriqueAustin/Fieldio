"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "../../lib/utils";
import { boardTimeWindow, layoutLane, type Availability } from "../../lib/schedule-utils";

export type BoardLane = {
    id: string;
    kind: "tech" | "van" | "unassigned";
    label: string;
    sublabel?: string;
    status?: Availability;
};

export type BoardEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    backgroundColor?: string;
    editable?: boolean;
    extendedProps: {
        techId?: string | null;
        vanId?: string | null;
        status: string;
        customerName?: string;
        address?: string;
        techName?: string | null;
        vanName?: string | null;
    };
};

/** dataTransfer type for jobs dragged in from outside the board: JSON.stringify({ jobId, title }). */
export const JOB_DRAG_MIME = "application/x-fieldio-job";
const BOARD_DRAG_MIME = "application/x-fieldio-board-event";

const LABEL_WIDTH = 160;
const HOUR_WIDTH = 96;
const ROW_HEIGHT = 48;
const LANE_PADDING = 6;
const SNAP_MINUTES = 15;
const EXTERNAL_DURATION_MINUTES = 60;

const AVAILABILITY_DOT: Record<Availability, string> = {
    FREE: "bg-emerald-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    BUSY: "bg-blue-500",
    OFFLINE: "bg-slate-300",
};
const AVAILABILITY_LABEL: Record<Availability, string> = {
    FREE: "Available",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    BUSY: "Scheduled",
    OFFLINE: "Offline",
};
const JOB_STATUS_DOT: Record<string, string> = {
    REQUESTED: "bg-slate-400",
    SCHEDULED: "bg-blue-400",
    ASSIGNED: "bg-blue-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    IN_PROGRESS: "bg-amber-500",
    COMPLETED: "bg-emerald-500",
    CANCELED: "bg-rose-500",
    CANCELLED: "bg-rose-500",
};

const minutesSinceMidnight = (d: Date, midnight: Date) => (d.getTime() - midnight.getTime()) / 60000;

type DragState =
    | { kind: "internal"; eventId: string; laneId: string; startMin: number; durationMin: number; grabOffsetMin: number }
    | { kind: "external" };

type Ghost = { laneId: string; startMin: number; durationMin: number };

type ParsedEvent = Omit<BoardEvent, "start" | "end"> & { start: Date; end: Date };
type LaidOutEvent = ParsedEvent & { leftPct: number; widthPct: number; row: number; rows: number };

function laneMatches(lane: BoardLane, event: Pick<BoardEvent, "extendedProps">) {
    const { techId, vanId } = event.extendedProps;
    if (lane.kind === "tech") return techId === lane.id;
    if (lane.kind === "van") return vanId === lane.id;
    return !techId && !vanId;
}

function laneAssignment(lane: BoardLane): { techId: string | null; vanId: string | null } {
    if (lane.kind === "tech") return { techId: lane.id, vanId: null };
    if (lane.kind === "van") return { techId: null, vanId: lane.id };
    return { techId: null, vanId: null };
}

export function DispatchBoard({
    date,
    events,
    lanes,
    hours,
    highlightLaneId,
    onEventClick,
    onMove,
    onDropUnscheduled,
    onSlotClick,
}: {
    date: Date;
    events: BoardEvent[];
    lanes: BoardLane[];
    hours: { start: string; end: string } | null;
    highlightLaneId?: string | null;
    onEventClick: (eventId: string) => void;
    onMove: (a: { jobId: string; start: Date; end: Date; techId: string | null; vanId: string | null }) => Promise<void>;
    onDropUnscheduled: (a: {
        jobId: string;
        title: string;
        start: Date;
        end: Date;
        techId: string | null;
        vanId: string | null;
    }) => Promise<void>;
    onSlotClick: (a: { start: Date; laneId: string; kind: BoardLane["kind"] }) => void;
}): JSX.Element {
    const [pending, setPending] = useState(false);
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const laneRefs = useRef(new Map<string, HTMLDivElement>());

    const midnight = useMemo(() => new Date(date.getFullYear(), date.getMonth(), date.getDate()), [date]);

    const parsed = useMemo(
        () =>
            events
                .map((event): ParsedEvent => ({ ...event, start: new Date(event.start), end: new Date(event.end) }))
                .filter((event) => !Number.isNaN(event.start.getTime()) && !Number.isNaN(event.end.getTime())),
        [events]
    );

    // Business hours ±1h (07:00–18:00 shaded when closed), widened to fit the day of jobs.
    const range = useMemo(() => boardTimeWindow(hours, parsed, date), [hours, parsed, date]);
    const totalMin = range.endMin - range.startMin;
    const trackWidth = (totalMin / 60) * HOUR_WIDTH;
    const pct = (min: number) => ((min - range.startMin) / totalMin) * 100;
    const atMinutes = (min: number) => new Date(midnight.getTime() + min * 60000);

    const laidOut = useMemo(() => {
        const dayStart = new Date(midnight.getTime() + range.startMin * 60000);
        const dayEnd = new Date(midnight.getTime() + range.endMin * 60000);
        const byLane = new Map<string, LaidOutEvent[]>();
        lanes.forEach((lane) => {
            byLane.set(lane.id, layoutLane(parsed.filter((event) => laneMatches(lane, event)), dayStart, dayEnd));
        });
        return byLane;
    }, [parsed, lanes, midnight, range.startMin, range.endMin]);

    // "Now" line, refreshed every minute while the shown day is today.
    const [now, setNow] = useState(() => new Date());
    const showingToday = isSameDay(date, now);
    useEffect(() => {
        if (!isSameDay(date, new Date())) return;
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, [date]);
    const nowMin = minutesSinceMidnight(now, midnight);
    const showNowLine = showingToday && nowMin >= range.startMin && nowMin <= range.endMin;

    useEffect(() => {
        if (!highlightLaneId) return;
        laneRefs.current.get(highlightLaneId)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }, [highlightLaneId]);

    const pointerMinutes = (clientX: number, track: HTMLElement) => {
        const rect = track.getBoundingClientRect();
        const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
        return range.startMin + Math.min(1, Math.max(0, ratio)) * totalMin;
    };
    const snap = (min: number) => Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
    const clampStart = (min: number, durationMin: number) =>
        Math.min(Math.max(min, range.startMin), Math.max(range.startMin, range.endMin - Math.min(durationMin, totalMin)));

    // Decide internal vs external from the dataTransfer types, not the ref alone: if a dragged
    // block unmounts mid-drag (refetch), dragend never fires and the ref would be stale.
    const currentDrag = (e: DragEvent): DragState | null => {
        const types = Array.from(e.dataTransfer.types);
        const ref = dragRef.current;
        if (types.includes(BOARD_DRAG_MIME) && ref?.kind === "internal") return ref;
        if (ref?.kind === "internal") dragRef.current = null;
        return types.includes(JOB_DRAG_MIME) ? { kind: "external" } : null;
    };

    const dropTarget = (e: DragEvent<HTMLDivElement>, drag: DragState | null) => {
        const pointer = pointerMinutes(e.clientX, e.currentTarget);
        if (drag?.kind === "internal") {
            return {
                startMin: clampStart(snap(pointer - drag.grabOffsetMin), drag.durationMin),
                durationMin: drag.durationMin,
            };
        }
        return {
            startMin: clampStart(snap(pointer), EXTERNAL_DURATION_MINUTES),
            durationMin: EXTERNAL_DURATION_MINUTES,
        };
    };

    const handleDragOver = (lane: BoardLane) => (e: DragEvent<HTMLDivElement>) => {
        const drag = pending ? null : currentDrag(e);
        if (!drag) return;
        e.preventDefault();
        // "move" for both: the unscheduled panel sets effectAllowed="move", and a mismatched
        // dropEffect resolves to "none" so the drop would never fire.
        e.dataTransfer.dropEffect = "move";
        const { startMin, durationMin } = dropTarget(e, drag);
        setGhost((prev) =>
            prev && prev.laneId === lane.id && prev.startMin === startMin && prev.durationMin === durationMin
                ? prev
                : { laneId: lane.id, startMin, durationMin }
        );
    };

    const handleDragLeave = (lane: BoardLane) => (e: DragEvent<HTMLDivElement>) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setGhost((prev) => (prev?.laneId === lane.id ? null : prev));
    };

    const runPending = async (action: () => Promise<void>) => {
        setPending(true);
        try {
            await action();
        } catch {
            // The parent surfaces the failure (toast) and refetches; the board just unlocks.
        } finally {
            setPending(false);
        }
    };

    const handleDrop = (lane: BoardLane) => (e: DragEvent<HTMLDivElement>) => {
        const drag = currentDrag(e);
        dragRef.current = null;
        setGhost(null);
        if (pending || !drag) return;
        e.preventDefault();
        const { startMin, durationMin } = dropTarget(e, drag);
        const start = atMinutes(startMin);
        const end = atMinutes(startMin + durationMin);
        const assignment = laneAssignment(lane);

        if (drag.kind === "internal") {
            if (e.dataTransfer.getData(BOARD_DRAG_MIME) !== drag.eventId) return;
            if (drag.laneId === lane.id && drag.startMin === startMin) return;
            void runPending(() => onMove({ jobId: drag.eventId, start, end, ...assignment }));
            return;
        }

        const raw = e.dataTransfer.getData(JOB_DRAG_MIME);
        if (!raw) return;
        let payload: { jobId?: unknown; title?: unknown };
        try {
            payload = JSON.parse(raw) as { jobId?: unknown; title?: unknown };
        } catch {
            return;
        }
        if (typeof payload.jobId !== "string" || !payload.jobId) return;
        const jobId = payload.jobId;
        const title = typeof payload.title === "string" ? payload.title : "";
        void runPending(() => onDropUnscheduled({ jobId, title, start, end, ...assignment }));
    };

    const handleBlockDragStart = (lane: BoardLane, event: LaidOutEvent) => (e: DragEvent<HTMLButtonElement>) => {
        if (pending || event.editable === false) {
            e.preventDefault();
            return;
        }
        const track = e.currentTarget.closest<HTMLElement>("[data-lane-track]");
        const startMin = minutesSinceMidnight(event.start, midnight);
        const durationMin = Math.max(1, Math.round((event.end.getTime() - event.start.getTime()) / 60000));
        const grabOffsetMin = track ? pointerMinutes(e.clientX, track) - startMin : 0;
        dragRef.current = { kind: "internal", eventId: event.id, laneId: lane.id, startMin, durationMin, grabOffsetMin };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(BOARD_DRAG_MIME, event.id);
    };

    const handleBlockDragEnd = () => {
        dragRef.current = null;
        setGhost(null);
    };

    const handleTrackClick = (lane: BoardLane) => (e: MouseEvent<HTMLDivElement>) => {
        const startMin = clampStart(snap(pointerMinutes(e.clientX, e.currentTarget)), SNAP_MINUTES);
        onSlotClick({ start: atMinutes(startMin), laneId: lane.id, kind: lane.kind });
    };

    const onlyUnassigned = lanes.every((lane) => lane.kind === "unassigned");
    if (onlyUnassigned && events.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-background px-6 py-10 text-center">
                <p className="text-sm font-medium">No technicians or vans yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Add technicians or van teams to dispatch jobs on the board.
                </p>
            </div>
        );
    }

    const hourTicks: number[] = [];
    for (let min = Math.ceil(range.startMin / 60) * 60; min <= range.endMin; min += 60) hourTicks.push(min);

    const shading =
        range.open === null || range.close === null
            ? [{ from: range.startMin, to: range.endMin }]
            : [
                  { from: range.startMin, to: range.open },
                  { from: range.close, to: range.endMin },
              ].filter((s) => s.to > s.from);

    return (
        <div
            className="h-full overflow-auto rounded-2xl border border-border bg-background"
            aria-busy={pending}
            aria-label={`Dispatch board for ${format(date, "EEEE d MMMM yyyy")}`}
            role="region"
        >
            <div style={{ width: LABEL_WIDTH + trackWidth }} className="relative">
                {/* Header with hour ticks */}
                <div className="sticky top-0 z-30 flex border-b border-border bg-background">
                    <div
                        className="sticky left-0 z-40 shrink-0 border-r border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground"
                        style={{ width: LABEL_WIDTH }}
                    >
                        {range.open === null ? "Closed" : "Team"}
                    </div>
                    <div className="relative h-9" style={{ width: trackWidth }}>
                        {hourTicks.map((min) => (
                            <span
                                key={min}
                                className="absolute top-2 -translate-x-1/2 text-[11px] tabular-nums text-muted-foreground"
                                style={{ left: `${pct(min)}%` }}
                            >
                                {min === 24 * 60 ? "24:00" : format(atMinutes(min), "HH:mm")}
                            </span>
                        ))}
                        {showNowLine ? (
                            <span
                                className="absolute bottom-0 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-destructive"
                                style={{ left: `${pct(nowMin)}%` }}
                                aria-hidden
                            />
                        ) : null}
                    </div>
                </div>

                {lanes.map((lane) => {
                    const items = laidOut.get(lane.id) ?? [];
                    const maxRows = items.reduce((max, item) => Math.max(max, item.rows), 1);
                    const laneHeight = maxRows * ROW_HEIGHT + LANE_PADDING * 2;
                    const highlighted = highlightLaneId === lane.id;
                    const laneGhost = ghost?.laneId === lane.id ? ghost : null;

                    return (
                        <div
                            key={`${lane.kind}-${lane.id}`}
                            ref={(node) => {
                                if (node) laneRefs.current.set(lane.id, node);
                                else laneRefs.current.delete(lane.id);
                            }}
                            className={cn("flex border-b border-border last:border-b-0", highlighted && "bg-primary/5")}
                        >
                            <div
                                className={cn(
                                    "sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-background px-3",
                                    highlighted && "ring-2 ring-inset ring-primary"
                                )}
                                style={{ width: LABEL_WIDTH, minHeight: laneHeight }}
                            >
                                {lane.status ? (
                                    <span
                                        className={cn("h-2 w-2 shrink-0 rounded-full", AVAILABILITY_DOT[lane.status])}
                                        title={AVAILABILITY_LABEL[lane.status]}
                                        aria-label={AVAILABILITY_LABEL[lane.status]}
                                        role="img"
                                    />
                                ) : null}
                                <div className="min-w-0">
                                    <p
                                        className={cn(
                                            "truncate text-sm font-medium",
                                            lane.kind === "unassigned" && "text-muted-foreground"
                                        )}
                                    >
                                        {lane.label}
                                    </p>
                                    {lane.sublabel ? (
                                        <p className="truncate text-xs text-muted-foreground">{lane.sublabel}</p>
                                    ) : null}
                                </div>
                            </div>

                            <div
                                data-lane-track
                                className="relative cursor-pointer"
                                style={{ width: trackWidth, height: laneHeight }}
                                onClick={handleTrackClick(lane)}
                                onDragOver={handleDragOver(lane)}
                                onDragLeave={handleDragLeave(lane)}
                                onDrop={handleDrop(lane)}
                            >
                                {shading.map((s) => (
                                    <div
                                        key={`${s.from}-${s.to}`}
                                        className="pointer-events-none absolute inset-y-0 bg-muted/70"
                                        style={{ left: `${pct(s.from)}%`, width: `${pct(s.to) - pct(s.from)}%` }}
                                        aria-hidden
                                    />
                                ))}
                                {hourTicks.map((min) => (
                                    <div
                                        key={min}
                                        className="pointer-events-none absolute inset-y-0 border-l border-border/60"
                                        style={{ left: `${pct(min)}%` }}
                                        aria-hidden
                                    />
                                ))}
                                {showNowLine ? (
                                    <div
                                        className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-destructive"
                                        style={{ left: `${pct(nowMin)}%` }}
                                        aria-hidden
                                    />
                                ) : null}

                                {laneGhost ? (
                                    <div
                                        className="pointer-events-none absolute z-[6] rounded-md border-2 border-dashed border-primary bg-primary/10 px-1.5 text-[11px] font-medium tabular-nums text-primary"
                                        style={{
                                            left: `${pct(laneGhost.startMin)}%`,
                                            width: `${(laneGhost.durationMin / totalMin) * 100}%`,
                                            top: LANE_PADDING,
                                            bottom: LANE_PADDING,
                                        }}
                                        aria-hidden
                                    >
                                        {format(atMinutes(laneGhost.startMin), "HH:mm")}
                                    </div>
                                ) : null}

                                {items.map((event) => {
                                    const locked = event.editable === false;
                                    const timeLabel = `${format(event.start, "HH:mm")}–${format(event.end, "HH:mm")}`;
                                    const customer = event.extendedProps.customerName;
                                    return (
                                        <button
                                            key={event.id}
                                            type="button"
                                            draggable={!locked && !pending}
                                            onDragStart={handleBlockDragStart(lane, event)}
                                            onDragEnd={handleBlockDragEnd}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick(event.id);
                                            }}
                                            aria-label={`${event.title}, ${timeLabel}`}
                                            title={[event.title, timeLabel, customer, event.extendedProps.address]
                                                .filter(Boolean)
                                                .join("\n")}
                                            className={cn(
                                                "absolute z-[4] flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                                event.backgroundColor ? "text-white" : "bg-primary text-primary-foreground",
                                                locked ? "cursor-default opacity-50 grayscale" : "cursor-grab active:cursor-grabbing",
                                                pending && !locked && "cursor-wait"
                                            )}
                                            style={{
                                                left: `${event.leftPct}%`,
                                                width: `max(${event.widthPct}%, 8px)`,
                                                top: LANE_PADDING + event.row * ROW_HEIGHT,
                                                height: ROW_HEIGHT - 4,
                                                backgroundColor: event.backgroundColor,
                                            }}
                                        >
                                            <span className="flex items-center gap-1">
                                                <span
                                                    className={cn(
                                                        "h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/70",
                                                        JOB_STATUS_DOT[event.extendedProps.status] ?? "bg-slate-400"
                                                    )}
                                                    aria-hidden
                                                />
                                                <span className="truncate tabular-nums opacity-90">{timeLabel}</span>
                                            </span>
                                            <span className="truncate font-semibold">{event.title}</span>
                                            {customer ? <span className="truncate opacity-90">{customer}</span> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
