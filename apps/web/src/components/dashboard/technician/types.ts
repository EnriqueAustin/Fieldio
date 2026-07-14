import { format, formatDistanceToNowStrict } from "date-fns";

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

export function getJobTiming(job: TechnicianJob) {
    if (job.status === "ON_SITE" && job.actualStart) {
        return `On site for ${formatDistanceToNowStrict(new Date(job.actualStart))}`;
    }
    if (job.scheduledStart && job.scheduledEnd) {
        return `${format(new Date(job.scheduledStart), "p")} - ${format(new Date(job.scheduledEnd), "p")}`;
    }
    if (job.scheduledStart) {
        return format(new Date(job.scheduledStart), "p");
    }
    return "Schedule pending";
}
