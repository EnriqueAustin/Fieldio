import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";

export interface TechnicianViewProps {
    user: {
        id: string;
        email: string;
        role: string;
        companyId: string;
        companyName: string;
    };
    stats: unknown;
}

export interface JobChecklistItem {
    id: string;
    label: string;
    isCompleted: boolean;
    completedAt?: string | null;
}

export interface JobPhoto {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    createdAt: string;
}

export interface JobNote {
    id: string;
    jobId: string;
    message: string;
    createdAt: string;
    author?: {
        id: string;
        email: string;
        // The API already composes this from first + last name; the UI used to
        // ignore it and show the email prefix instead.
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        avatarUrl?: string | null;
    } | null;
}

export interface JobSignature {
    id: string;
    signerName: string;
    signatureDataUrl: string;
    signedAt: string;
}

export interface JobLineItem {
    id: string;
    name: string;
    description?: string | null;
    quantity: number;
    type: "SERVICE" | "MATERIAL" | "LABOR";
}

// Pricing is intentionally omitted from technician-facing payloads — the API
// strips it for the TECHNICIAN role. Techs select items and quantities only.
export interface PriceBookItem {
    id: string;
    name: string;
    description?: string | null;
    type: "SERVICE" | "MATERIAL" | "LABOR";
    category?: string | null;
    sku?: string | null;
}

export interface TechnicianJob {
    id: string;
    status: "REQUESTED" | "ASSIGNED" | "EN_ROUTE" | "ON_SITE" | "COMPLETED" | "CANCELED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
    title: string;
    description?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
    summaryEmailedAt?: string | null;
    // Set once the job has been invoiced (timestamp only — never an amount) so the
    // closeout tab can show "invoice sent" without exposing pricing to the tech.
    invoicedAt?: string | null;
    customer: {
        id: string;
        name: string;
        phone?: string | null;
        email?: string | null;
    };
    property: {
        addressLine1: string;
        addressLine2?: string | null;
        city: string;
        state: string;
        zip: string;
    };
    checklist: JobChecklistItem[];
    lineItems: JobLineItem[];
    photos: JobPhoto[];
    signatures: JobSignature[];
    notes: JobNote[];
}

// Draft quote line — tech picks price-book item + quantity only; the server prices it.
export interface QuoteDraftItem {
    priceBookItemId?: string;
    name: string;
    quantity: number;
    type: string;
}

export const STATUS_LABELS: Record<TechnicianJob["status"], string> = {
    REQUESTED: "Requested",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
};

export const STATUS_STYLES: Record<TechnicianJob["status"], string> = {
    REQUESTED: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-100 text-blue-700",
    EN_ROUTE: "bg-violet-100 text-violet-700",
    ON_SITE: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELED: "bg-rose-100 text-rose-700",
};

export const JOB_STATUS_FLOW: Record<string, TechnicianJob["status"] | null> = {
    ASSIGNED: "EN_ROUTE",
    EN_ROUTE: "ON_SITE",
    ON_SITE: "COMPLETED",
};

export function getAddress(job: TechnicianJob) {
    return [
        job.property.addressLine1,
        job.property.addressLine2,
        `${job.property.city}, ${job.property.state} ${job.property.zip}`,
    ]
        .filter(Boolean)
        .join(", ");
}

/** Day prefix for a job that is not today — "" for today, "Tomorrow", "Thu 28 Aug".
 *  Without this every upcoming job read as a bare clock time, so a job next week
 *  was indistinguishable from one this afternoon. */
function dayPrefix(date: Date) {
    if (isToday(date)) return "";
    if (isTomorrow(date)) return "Tomorrow ";
    return `${format(date, "EEE d MMM")} `;
}

export function getJobTiming(job: TechnicianJob) {
    if (job.status === "ON_SITE" && job.actualStart) {
        return `On site for ${formatDistanceToNowStrict(new Date(job.actualStart))}`;
    }
    if (job.scheduledStart) {
        const start = new Date(job.scheduledStart);
        const day = dayPrefix(start);
        if (job.scheduledEnd) {
            return `${day}${format(start, "p")} - ${format(new Date(job.scheduledEnd), "p")}`;
        }
        return `${day}${format(start, "p")}`;
    }
    return "Schedule pending";
}

/** Shorter suburb/city label for job cards. */
export function getLocationLabel(job: TechnicianJob) {
    return [job.property.city, job.property.state].filter(Boolean).join(", ") || "No address";
}

// Priority badge — only surfaced for the two that matter in the field. EMERGENCY
// is loud red; HIGH is amber. LOW/MEDIUM return null (no badge, less noise).
export const PRIORITY_BADGE: Record<
    TechnicianJob["priority"],
    { label: string; className: string } | null
> = {
    LOW: null,
    MEDIUM: null,
    HIGH: { label: "High", className: "bg-amber-100 text-amber-800 ring-1 ring-amber-300" },
    EMERGENCY: {
        label: "Emergency",
        className: "bg-red-600 text-white ring-1 ring-red-700 animate-pulse",
    },
};

export type JobTimeGroup = "overdue" | "today" | "upcoming";

export const JOB_GROUP_ORDER: JobTimeGroup[] = ["overdue", "today", "upcoming"];

export const JOB_GROUP_LABELS: Record<JobTimeGroup, string> = {
    overdue: "Overdue",
    today: "Today",
    upcoming: "Upcoming",
};

/** Bucket a job as Overdue / Today / Upcoming based on scheduledStart vs today.
 *  Overdue = scheduled before today and not yet completed. Unscheduled jobs fall
 *  into Upcoming so they never masquerade as urgent. */
export function getJobTimeGroup(job: TechnicianJob): JobTimeGroup {
    if (!job.scheduledStart) return "upcoming";
    const scheduled = new Date(job.scheduledStart);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    if (job.status !== "COMPLETED" && scheduled < startToday) return "overdue";
    if (scheduled >= startToday && scheduled < startTomorrow) return "today";
    return "upcoming";
}

/** Group + time-sort assigned jobs for the mobile home list. */
export function groupJobs(jobs: TechnicianJob[]): { group: JobTimeGroup; jobs: TechnicianJob[] }[] {
    const byTime = (a: TechnicianJob, b: TechnicianJob) => {
        const at = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
    };
    return JOB_GROUP_ORDER.map((group) => ({
        group,
        jobs: jobs.filter((job) => getJobTimeGroup(job) === group).sort(byTime),
    })).filter((section) => section.jobs.length > 0);
}

/** The single primary status action for a job, or null once completed/canceled.
 *  Shared by the sticky action bar, the up-next hero, and the job header. */
export function getPrimaryAction(
    job: TechnicianJob
): { label: string; nextStatus: TechnicianJob["status"] } | null {
    const next = JOB_STATUS_FLOW[job.status];
    if (!next) return null;
    const label =
        job.status === "ASSIGNED"
            ? "Start route"
            : job.status === "EN_ROUTE"
            ? "Arrive on site"
            : "Complete job";
    return { label, nextStatus: next };
}
