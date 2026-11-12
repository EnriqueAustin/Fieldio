"use client";

import { useEffect, useMemo, useState } from "react";
import { onlineManager, useQueryClient, type Mutation } from "@tanstack/react-query";
import { AlertTriangle, Clock, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { isFieldMutation, mutationLabel } from "../../lib/offline-mutations";
import { isRetryableError } from "../../lib/network-error";

interface OutboxSheetProps {
    open: boolean;
    onClose: () => void;
}

type Row = {
    id: number;
    action: string;
    jobLabel: string;
    kind: "paused" | "syncing" | "retrying" | "failed";
    message?: string;
    // A "syncing" row whose request has been in flight > STUCK_MS — offer Retry.
    stuck: boolean;
    mutation: Mutation<any, any, any, any>;
};

// How long a request may sit "Syncing…" before we assume it wedged (lost socket,
// a reconnect that never resolved) and surface a Retry button.
const STUCK_MS = 30_000;

/** The offline outbox: every field change that is queued, syncing, or has failed
 *  to sync, with Retry and Discard. Opened from the offline banner. Shows no
 *  pricing — techs never see amounts. */
export function OutboxSheet({ open, onClose }: OutboxSheetProps) {
    const queryClient = useQueryClient();
    const [rows, setRows] = useState<Row[]>([]);
    const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        const cache = queryClient.getMutationCache();

        const refresh = () => {
            // Resolve a friendly job name from the cached assigned-jobs list.
            const jobs = queryClient
                .getQueriesData({ queryKey: ["technician-assigned-jobs"] })
                .flatMap(([, data]) => (Array.isArray(data) ? (data as any[]) : []));
            const nameFor = (jobId?: string) => {
                if (!jobId) return "";
                const job = jobs.find((j) => j?.id === jobId);
                if (job?.title) return job.title as string;
                if (job?.customer?.name) return job.customer.name as string;
                return `Job ${jobId.slice(0, 6)}`;
            };

            const next: Row[] = cache
                .getAll()
                .filter(isFieldMutation)
                .filter((m) => m.state.isPaused || m.state.status === "pending" || m.state.status === "error")
                .map((m) => {
                    const label = mutationLabel(m);
                    const retryable = isRetryableError(m.state.failureReason);
                    let kind: Row["kind"];
                    if (m.state.status === "error") kind = retryable ? "retrying" : "failed";
                    else if (m.state.isPaused) kind = "paused";
                    else kind = "syncing";
                    const serverMessage =
                        kind === "failed"
                            ? (m.state.failureReason as any)?.response?.data?.message
                            : undefined;
                    const submittedAt = (m.state as any).submittedAt as number | undefined;
                    const stuck =
                        kind === "syncing" && !!submittedAt && Date.now() - submittedAt > STUCK_MS;
                    return {
                        id: m.mutationId,
                        action: label.action,
                        jobLabel: nameFor(label.jobId),
                        kind,
                        message: serverMessage,
                        stuck,
                        mutation: m,
                    };
                });
            setRows(next);
        };

        refresh();
        // A row crosses the "stuck" threshold with no cache event, so also re-check
        // on a timer while the sheet is open.
        const timer = setInterval(refresh, 5_000);
        const unsubscribe = cache.subscribe(refresh);
        return () => {
            clearInterval(timer);
            unsubscribe();
        };
    }, [open, queryClient]);

    const failedCount = useMemo(() => rows.filter((r) => r.kind === "failed").length, [rows]);

    if (!open) return null;

    const retry = (row: Row) => {
        // Re-run with the SAME variables (same idempotency key), so a retry can't
        // create a duplicate. execute() re-sends immediately when online.
        void row.mutation.execute(row.mutation.state.variables as any).catch(() => {});
    };

    const discard = (row: Row) => {
        queryClient.getMutationCache().remove(row.mutation);
        setConfirmDiscard(null);
        // Reconcile the optimistic UI against the server once reachable.
        void queryClient.invalidateQueries({ queryKey: ["technician-assigned-jobs"] });
        void queryClient.invalidateQueries({ queryKey: ["my-week"] });
        const jobId = (row.mutation.state.variables as any)?.jobId;
        if (jobId) void queryClient.invalidateQueries({ queryKey: ["job-forms", jobId] });
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={onClose}>
            <div
                className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
                    <div>
                        <h2 className="text-base font-semibold">Outbox</h2>
                        <p className="text-xs text-muted-foreground">
                            {rows.length === 0
                                ? "Everything is synced"
                                : `${rows.length} change${rows.length !== 1 ? "s" : ""} queued${
                                      failedCount > 0 ? ` · ${failedCount} failed` : ""
                                  }`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close outbox"
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 active:scale-95"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-2 p-4">
                    {rows.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            No changes waiting to sync.
                        </p>
                    )}

                    {rows.map((row) => (
                        <div
                            key={row.id}
                            className={`rounded-xl border p-3 ${
                                row.kind === "failed" ? "border-rose-200 bg-rose-50" : "border-border"
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <StatusIcon kind={row.kind} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{row.action}</div>
                                    {row.jobLabel && (
                                        <div className="truncate text-xs text-muted-foreground">{row.jobLabel}</div>
                                    )}
                                    <div className={`mt-0.5 text-xs ${row.kind === "failed" ? "text-rose-700" : "text-muted-foreground"}`}>
                                        {statusText(row)}
                                    </div>
                                </div>
                            </div>

                            {confirmDiscard === row.id ? (
                                <div className="mt-3 flex items-center justify-end gap-2">
                                    <span className="mr-auto text-xs text-muted-foreground">Discard this change?</span>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDiscard(null)}
                                        className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-slate-100"
                                    >
                                        Keep
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => discard(row)}
                                        className="h-9 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white active:scale-95"
                                    >
                                        Discard
                                    </button>
                                </div>
                            ) : (
                                (row.kind === "failed" || row.kind === "retrying" || row.kind === "paused" || row.stuck) && (
                                    <div className="mt-3 flex items-center justify-end gap-2">
                                        {onlineManager.isOnline() && (
                                            <button
                                                type="button"
                                                onClick={() => retry(row)}
                                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-slate-50 active:scale-95"
                                            >
                                                <RefreshCw className="h-4 w-4" />
                                                Retry
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDiscard(row.id)}
                                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 active:scale-95"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Discard
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatusIcon({ kind }: { kind: Row["kind"] }) {
    if (kind === "failed") return <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />;
    if (kind === "syncing") return <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-500" />;
    if (kind === "retrying") return <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />;
    return <Clock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />;
}

function statusText(row: Row): string {
    switch (row.kind) {
        case "failed":
            return row.message ?? "Failed to sync — the server rejected this change.";
        case "retrying":
            return "Couldn’t reach the server — will keep trying.";
        case "syncing":
            return row.stuck ? "Still syncing — taking longer than usual." : "Syncing…";
        case "paused":
        default:
            return "Waiting for signal";
    }
}
