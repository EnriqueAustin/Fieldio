import { cn } from "../../lib/utils";

const STATUS_STYLES: Record<string, string> = {
    REQUESTED: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
    ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
    EN_ROUTE: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
    ON_SITE: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    CANCELED: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",

    DRAFT: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
    SENT: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
    PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    PARTIAL: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
    VOID: "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",

    APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    DECLINED: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
    EXPIRED: "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",

    LOW: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    EMERGENCY: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
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
