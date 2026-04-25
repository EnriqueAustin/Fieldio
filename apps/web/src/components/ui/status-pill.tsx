import { cn } from "../../lib/utils";

const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-50 text-slate-700 ring-slate-200",
    ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
    EN_ROUTE: "bg-violet-50 text-violet-700 ring-violet-200",
    ON_SITE: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    CANCELED: "bg-rose-50 text-rose-700 ring-rose-200",

    DRAFT: "bg-slate-50 text-slate-700 ring-slate-200",
    SENT: "bg-blue-50 text-blue-700 ring-blue-200",
    PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PARTIAL: "bg-amber-50 text-amber-700 ring-amber-200",
    OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200",
    VOID: "bg-slate-50 text-slate-500 ring-slate-200",

    APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    DECLINED: "bg-rose-50 text-rose-700 ring-rose-200",
    EXPIRED: "bg-slate-50 text-slate-500 ring-slate-200",

    LOW: "bg-slate-50 text-slate-600 ring-slate-200",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    EMERGENCY: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STATUS_DOT: Record<string, string> = {
    REQUESTED: "bg-slate-400",
    ASSIGNED: "bg-blue-500",
    EN_ROUTE: "bg-violet-500",
    ON_SITE: "bg-amber-500",
    COMPLETED: "bg-emerald-500",
    CANCELED: "bg-rose-500",
    DRAFT: "bg-slate-400",
    SENT: "bg-blue-500",
    PAID: "bg-emerald-500",
    PARTIAL: "bg-amber-500",
    OVERDUE: "bg-rose-500",
    VOID: "bg-slate-400",
    APPROVED: "bg-emerald-500",
    DECLINED: "bg-rose-500",
    EXPIRED: "bg-slate-400",
    LOW: "bg-slate-400",
    MEDIUM: "bg-blue-500",
    HIGH: "bg-amber-500",
    EMERGENCY: "bg-rose-500",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
    const key = status?.toUpperCase() ?? "";
    return (
        <span className={cn("status-pill", STATUS_STYLES[key] ?? STATUS_STYLES.REQUESTED, className)}>
            <span className={cn("status-pill-dot", STATUS_DOT[key] ?? "bg-slate-400")} />
            {String(status).replace(/_/g, " ")}
        </span>
    );
}
