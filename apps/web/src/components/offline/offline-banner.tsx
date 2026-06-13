"use client";

import { useEffect, useRef, useState } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";

/**
 * Field-trust indicator. Shows when the tech is offline (with a count of
 * changes waiting to sync), while those changes are flushing on reconnect,
 * and a brief "all synced" confirmation once the queue drains.
 */
export function OfflineBanner() {
    const queryClient = useQueryClient();
    const [online, setOnline] = useState(true);
    const [pending, setPending] = useState(0);
    const [justSynced, setJustSynced] = useState(false);
    const prevPending = useRef(0);

    useEffect(() => {
        setOnline(onlineManager.isOnline());
        return onlineManager.subscribe((isOnline: boolean) => setOnline(isOnline));
    }, []);

    useEffect(() => {
        const cache = queryClient.getMutationCache();
        const update = () => {
            const count = cache
                .getAll()
                .filter((m) => m.state.isPaused || m.state.status === "pending").length;
            setPending(count);
            if (prevPending.current > 0 && count === 0 && onlineManager.isOnline()) {
                setJustSynced(true);
                window.setTimeout(() => setJustSynced(false), 2500);
            }
            prevPending.current = count;
        };
        update();
        return cache.subscribe(update);
    }, [queryClient]);

    if (online && pending === 0 && !justSynced) return null;

    let tone = "bg-amber-50 text-amber-800 border-amber-200";
    let icon = <WifiOff className="h-4 w-4" />;
    let message: string;

    if (!online) {
        message =
            pending > 0
                ? `You're offline — ${pending} change${pending !== 1 ? "s" : ""} will sync when you reconnect`
                : "You're offline — your work is saved on this device";
    } else if (pending > 0) {
        tone = "bg-blue-50 text-blue-800 border-blue-200";
        icon = <RefreshCw className="h-4 w-4 animate-spin" />;
        message = `Syncing ${pending} change${pending !== 1 ? "s" : ""}…`;
    } else {
        tone = "bg-emerald-50 text-emerald-800 border-emerald-200";
        icon = <CheckCircle2 className="h-4 w-4" />;
        message = "All changes synced";
    }

    return (
        <div className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm font-medium ${tone}`}>
            {icon}
            <span>{message}</span>
        </div>
    );
}
