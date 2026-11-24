"use client";

import { useCallback, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";
import type { TechnicianJob } from "./types";

// Status buttons are never disabled while an earlier change is still syncing
// (the FIFO field-ops scope queues the next tap behind it, and the optimistic
// status flips the button at once). The flip means a double-tap would fire the
// *next* step too — e.g. "Start route" twice = arrived. Ignore a second status
// tap on the same job inside this window.
const DOUBLE_TAP_MS = 1000;

/** Status progression + checklist toggles — both offline-queued OFFLINE_KEYS
 *  mutations that drive a job forward. */
export function useJobProgress() {
    const rawStatusMutation = useMutation<unknown, any, { jobId: string; status: TechnicianJob["status"] }>({
        mutationKey: OFFLINE_KEYS.status,
        onError: (error: any) => {
            toast({
                title: "Could not update job",
                description: error?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            });
        },
    });

    const lastTap = useRef<{ jobId: string; at: number } | null>(null);
    const { mutate: rawMutate } = rawStatusMutation;
    /** Returns false when the tap was swallowed as a double-tap (nothing sent). */
    const mutate = useCallback(
        (variables: Parameters<typeof rawMutate>[0], options?: Parameters<typeof rawMutate>[1]): boolean => {
            const now = Date.now();
            const last = lastTap.current;
            if (last && last.jobId === variables.jobId && now - last.at < DOUBLE_TAP_MS) return false;
            lastTap.current = { jobId: variables.jobId, at: now };
            rawMutate(variables, options);
            return true;
        },
        [rawMutate]
    );
    const statusMutation = useMemo(() => ({ ...rawStatusMutation, mutate }), [rawStatusMutation, mutate]);

    const checklistMutation = useMutation<unknown, any, { jobId: string; checkId: string; isCompleted: boolean }>({
        mutationKey: OFFLINE_KEYS.checklist,
        onError: () => {
            toast({
                title: "Checklist update failed",
                description: "Please try that again.",
                variant: "destructive",
            });
        },
    });

    return { statusMutation, checklistMutation };
}
