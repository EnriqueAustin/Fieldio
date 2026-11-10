"use client";

import { useEffect, useRef, useState } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { isFieldMutation } from "../../lib/offline-mutations";
import { isRetryableError } from "../../lib/network-error";
import { OutboxSheet } from "./outbox-sheet";

/**
 * Field-trust indicator. Counts queued (paused), in-flight, retrying and failed
 * field mutations straight from the MutationCache so it never lies — a change
 * that errored shows as failed, not "all synced". Tapping opens the outbox.
 */
export function OfflineBanner() {
    const queryClient = useQueryClient();
    const [online, setOnline] = useState(true);
    const [counts, setCounts] = useState({ queued: 0, failed: 0 });
    const [justSynced, setJustSynced] = useState(false);
    const [outboxOpen, setOutboxOpen] = useState(false);
    const prevActive = useRef(0);

    useEffect(() => {
        setOnline(onlineManager.isOnline());
        return onlineManager.subscribe((isOnline: boolean) => setOnline(isOnline));
    }, []);

    useEffect(() => {
        const cache = queryClient.getMutationCache();
        const update = () => {
            const field = cache.getAll().filter(isFieldMutation);
            // "failed" = errored with a definitive (non-retryable) 4xx — it will
            // never sync on its own and needs the tech to review/discard. Paused,
            // in-flight, and retryable-errored all still count as "will sync".
            const failed = field.filter(
                (m) => m.state.status === "error" && !isRetryableError(m.state.failureReason)
            ).length;
            const queued = field.filter(
                (m) =>
                    m.state.isPaused ||
                    m.state.status === "pending" ||
                    (m.state.status === "error" && isRetryableError(m.state.failureReason))
            ).length;
            setCounts({ queued, failed });

            const active = queued + failed;
            if (prevActive.current > 0 && active === 0 && onlineManager.isOnline()) {
                setJustSynced(true);
                window.setTimeout(() => setJustSynced(false), 2500);
            }
            prevActive.current = active;
        };
        update();
        return cache.subscribe(update);
    }, [queryClient]);

    const { queued, failed } = counts;
    const total = queued + failed;

    if (online && total === 0 && !justSynced) return null;

    let tone = "bg-amber-50 text-amber-800 border-amber-200";
    let icon = <WifiOff className="h-4 w-4" />;
    let message: string;
    const tappable = total > 0;

    if (failed > 0) {
        tone = "bg-rose-50 text-rose-800 border-rose-200";
        icon = <AlertTriangle className="h-4 w-4" />;
        message = `${failed} change${failed !== 1 ? "s" : ""} failed to sync — tap to review`;
    } else if (!online) {
        icon = <WifiOff className="h-4 w-4" />;
        message =
            queued > 0
                ? `You're offline — ${queued} change${queued !== 1 ? "s" : ""} will sync when you reconnect`
                : "You're offline — your work is saved on this device";
    } else if (queued > 0) {
        tone = "bg-blue-50 text-blue-800 border-blue-200";
        icon = <RefreshCw className="h-4 w-4 animate-spin" />;
        message = `Syncing ${queued} change${queued !== 1 ? "s" : ""}…`;
    } else {
        tone = "bg-emerald-50 text-emerald-800 border-emerald-200";
        icon = <CheckCircle2 className="h-4 w-4" />;
        message = "All changes synced";
    }

    const content = (
        <>
            {icon}
            <span>{message}</span>
            {tappable && <ChevronRight className="h-4 w-4 opacity-70" />}
        </>
    );

    return (
        <>
            {tappable ? (
                <button
                    type="button"
                    onClick={() => setOutboxOpen(true)}
                    className={`flex w-full items-center justify-center gap-2 border-b px-4 py-2 text-sm font-medium ${tone}`}
                >
                    {content}
                </button>
            ) : (
                <div className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm font-medium ${tone}`}>
                    {content}
                </div>
            )}
            <OutboxSheet open={outboxOpen} onClose={() => setOutboxOpen(false)} />
        </>
    );
}
