"use client";

import { useMutation } from "@tanstack/react-query";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";

type FieldInvoiceResult = {
    data?: { sent?: boolean; alreadyInvoiced?: boolean; sentTo?: string | null };
};

/**
 * Field closeout money step: one tap invoices the job and sends the customer a
 * pay link. Amounts are computed and stripped server-side — the tech only ever
 * sees a masked "sent to" indicator, never a total. Runs through the offline
 * queue (OFFLINE_KEYS.fieldInvoice) so a tap with no signal is paused, persisted
 * and replayed on reconnect, exactly like the field quote and status actions.
 */
export function useFieldInvoice() {
    const invoiceMutation = useMutation<FieldInvoiceResult, any, { jobId: string }>({
        mutationKey: OFFLINE_KEYS.fieldInvoice,
        onSuccess: (res) => {
            const alreadyInvoiced = res?.data?.alreadyInvoiced;
            const sentTo = res?.data?.sentTo;
            toast({
                title: alreadyInvoiced ? "Payment link re-sent" : "Invoice sent to customer",
                description: sentTo
                    ? `The customer got the pay link at ${sentTo}.`
                    : "The customer got a link to pay online.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Could not send invoice",
                description: error?.response?.data?.message ?? "Please try again when you have signal.",
                variant: "destructive",
            });
        },
    });

    /** Send the invoice + pay link. Offline, the mutation queues and we tell the
     *  tech it will send on reconnect (mirrors sendQuote). */
    const sendInvoice = (jobId: string) => {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        invoiceMutation.mutate({ jobId });
        if (offline) {
            toast({
                title: "Invoice queued",
                description: "No signal — the pay link will send automatically when you’re back online.",
            });
        }
    };

    return { invoiceMutation, sendInvoice };
}
