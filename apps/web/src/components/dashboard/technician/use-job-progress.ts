"use client";

import { useMutation } from "@tanstack/react-query";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";
import type { TechnicianJob } from "./types";

/** Status progression + checklist toggles — both offline-queued OFFLINE_KEYS
 *  mutations that drive a job forward. */
export function useJobProgress() {
    const statusMutation = useMutation<unknown, any, { jobId: string; status: TechnicianJob["status"] }>({
        mutationKey: OFFLINE_KEYS.status,
        onError: (error: any) => {
            toast({
                title: "Could not update job",
                description: error?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            });
        },
    });

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
