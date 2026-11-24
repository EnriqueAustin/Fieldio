"use client";

import type { ReactNode } from "react";
import { format, isSameDay } from "date-fns";
import { Clock, ExternalLink, MapPin, Phone, Sparkles, Truck, User, CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { StatusPill } from "../ui/status-pill";

/** Everything the quick view shows, taken from a schedule event's extendedProps. */
export type QuickViewJob = {
    id: string;
    title: string;
    start: string;
    end?: string | null;
    status: string;
    priority?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    address?: string | null;
    techName?: string | null;
    vanName?: string | null;
};

const CLOSED_STATUSES = new Set(["COMPLETED", "CANCELED"]);

function timeWindow(start: string, end?: string | null) {
    const s = new Date(start);
    if (Number.isNaN(s.getTime())) return "Not scheduled";
    if (!end) return format(s, "EEE d MMM, HH:mm");
    const e = new Date(end);
    if (Number.isNaN(e.getTime())) return format(s, "EEE d MMM, HH:mm");
    return isSameDay(s, e)
        ? `${format(s, "EEE d MMM, HH:mm")} – ${format(e, "HH:mm")}`
        : `${format(s, "EEE d MMM, HH:mm")} – ${format(e, "EEE d MMM, HH:mm")}`;
}

export function JobQuickView({
    job,
    onClose,
    onReassign,
    onSuggestTech,
}: {
    job: QuickViewJob | null;
    onClose: () => void;
    onReassign: (job: QuickViewJob) => void;
    onSuggestTech: (jobId: string) => void;
}) {
    const router = useRouter();
    const isClosed = job ? CLOSED_STATUSES.has(job.status?.toUpperCase()) : false;
    const assignee = job ? [job.techName, job.vanName].filter(Boolean).join(" · ") : "";

    return (
        <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                {job && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="pr-6 leading-snug">{job.title}</DialogTitle>
                            <DialogDescription className="sr-only">Job quick view</DialogDescription>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <StatusPill status={job.status} />
                                {job.priority && <StatusPill status={job.priority} />}
                            </div>
                        </DialogHeader>

                        <dl className="space-y-3 text-sm">
                            <Row icon={User} label="Customer">
                                {job.customerName || <span className="text-muted-foreground">Unknown customer</span>}
                            </Row>
                            {job.customerPhone && (
                                <Row icon={Phone} label="Phone">
                                    <a href={`tel:${job.customerPhone}`} className="text-primary hover:underline">
                                        {job.customerPhone}
                                    </a>
                                </Row>
                            )}
                            <Row icon={MapPin} label="Address">
                                {job.address ? (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                        {job.address}
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                ) : (
                                    <span className="text-muted-foreground">No address on file</span>
                                )}
                            </Row>
                            <Row icon={job.vanName && !job.techName ? Truck : User} label="Assigned to">
                                {assignee || <span className="text-muted-foreground">Unassigned</span>}
                            </Row>
                            <Row icon={Clock} label="Time window">
                                {timeWindow(job.start, job.end)}
                            </Row>
                        </dl>

                        <DialogFooter className="gap-2 sm:gap-0">
                            {!isClosed && (
                                <>
                                    <Button variant="outline" className="gap-1.5" onClick={() => onSuggestTech(job.id)}>
                                        <Sparkles className="h-4 w-4" />
                                        Suggest tech
                                    </Button>
                                    <Button variant="outline" className="gap-1.5" onClick={() => onReassign(job)}>
                                        <CalendarRange className="h-4 w-4" />
                                        Reassign / reschedule
                                    </Button>
                                </>
                            )}
                            <Button onClick={() => router.push(`/jobs/${job.id}`)}>Open job</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Row({
    icon: Icon,
    label,
    children,
}: {
    icon: typeof User;
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words">{children}</dd>
            </div>
        </div>
    );
}
