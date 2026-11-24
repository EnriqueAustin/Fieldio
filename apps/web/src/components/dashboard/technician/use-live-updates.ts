"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "../../../lib/socket";
import { refreshFieldQueriesWhenIdle } from "../../../lib/offline-mutations";
import { useAuthStore } from "../../../store/auth";

type JobPush = { id?: string; techId?: string | null; vanId?: string | null } | null | undefined;

/**
 * Keeps the tech's job lists (field console + My Schedule week) live when the
 * office assigns or moves work. The server sends a personal
 * `notification:received` (the bell shows it as a toast, e.g. "Job moved") and
 * company-wide job/schedule events; we refetch on the personal one always, and
 * on the company ones only when the job is plausibly this tech's — every job
 * change in the company reaches every tech's socket.
 *
 * The refetch waits for the offline field queue to drain so a push can't undo
 * a status the tech just tapped.
 */
export function useFieldLiveUpdates(
    userId: string | undefined,
    isMine: (job: { id?: string; vanId?: string | null }) => boolean
) {
    const queryClient = useQueryClient();
    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (!accessToken || !userId) return;
        if (!socket.connected) socket.connect();

        const refresh = () => void refreshFieldQueriesWhenIdle(queryClient);
        const onJobPush = (job: JobPush) => {
            if (!job) return;
            if (job.techId === userId || isMine(job)) refresh();
        };

        socket.on("notification:received", refresh);
        socket.on("schedule:updated", onJobPush);
        socket.on("job:updated", onJobPush);
        socket.on("job:created", onJobPush);
        // Events sent while the socket was down are gone; catch up on reconnect.
        socket.io.on("reconnect", refresh);
        return () => {
            socket.off("notification:received", refresh);
            socket.off("schedule:updated", onJobPush);
            socket.off("job:updated", onJobPush);
            socket.off("job:created", onJobPush);
            socket.io.off("reconnect", refresh);
        };
    }, [accessToken, userId, isMine, queryClient]);
}
