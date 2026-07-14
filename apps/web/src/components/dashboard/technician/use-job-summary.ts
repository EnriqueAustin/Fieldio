"use client";

import { useMutation } from "@tanstack/react-query";
import api from "../../../lib/api";
import { toast } from "../../ui/use-toast";

/** Customer job summary. The PDF is built server-side and delivered by email +
 *  WhatsApp, so no pricing is ever exposed to the tech. Needs signal (storage /
 *  messaging) — this is not queued for offline replay. */
export function useJobSummary() {
    const summaryMutation = useMutation<unknown, any, { jobId: string }>({
        mutationFn: async ({ jobId }) =>
            (await api.post(`/jobs/${jobId}/summary-pdf`, { email: true, whatsapp: true })).data,
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
