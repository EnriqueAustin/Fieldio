"use client";

import { useMutation } from "@tanstack/react-query";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";

/** Customer job summary. The PDF is built server-side and delivered by email +
 *  WhatsApp, so no pricing is ever exposed to the tech. Queued via the offline
 *  mutation default (mutationFn + Idempotency-Key live there), so a tap on patchy
 *  signal isn't lost and a retry can't double-send. */
export function useJobSummary() {
    const summaryMutation = useMutation<unknown, any, { jobId: string }>({
        mutationKey: OFFLINE_KEYS.summary,
        onSuccess: () => {
            toast({ title: "Job summary sent", description: "The customer gets it by email and WhatsApp." });
        },
        onError: (error: any) => {
            toast({
                title: "Could not send summary",
                description: error?.response?.data?.message ?? "Please try again when you have signal.",
                variant: "destructive",
            });
        },
    });

    return summaryMutation;
}
