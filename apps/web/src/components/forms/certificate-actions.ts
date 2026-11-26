"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { idempotencyHeaders, newClientMutationId } from "../../lib/offline-mutations";
import { toast } from "../ui/use-toast";

/**
 * Open a certificate PDF in a new tab. The API needs the Bearer token, so the
 * PDF is fetched as a blob through the shared client. The tab is opened up
 * front (inside the click) so popup blockers allow it; if it is blocked anyway
 * the file downloads instead.
 */
export async function openCertificatePdf(submissionId: string, fallbackName = "certificate.pdf"): Promise<void> {
    const win = window.open("", "_blank");
    try {
        const res = await api.get(`/digital-forms/submissions/${submissionId}/pdf`, { responseType: "blob" });
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        if (win) {
            win.location.href = url;
        } else {
            const disposition = res.headers?.["content-disposition"] as string | undefined;
            const a = document.createElement("a");
            a.href = url;
            a.download = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        // Give the new tab time to load the blob before releasing it.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
        win?.close();
        throw err;
    }
}

/** Wraps openCertificatePdf with an error toast, for click handlers. */
export function viewCertificatePdf(submissionId: string) {
    void openCertificatePdf(submissionId).catch((err: any) => {
        toast({
            title: "Couldn't open the certificate",
            description: err?.response?.status === 403 ? "You can only open certificates you submitted." : "Please try again.",
            variant: "destructive",
        });
    });
}

export interface SendCertificateResult {
    sentAt: string;
    channels: string[];
    sentTo: { email?: string | null; phone?: string | null };
}

/** Office: email / WhatsApp a certificate to the job's customer. */
export function useSendCertificate() {
    const qc = useQueryClient();
    return useMutation<
        SendCertificateResult,
        any,
        { submissionId: string; email?: boolean; whatsapp?: boolean; idempotencyKey?: string }
    >({
        // One key per click (stamped once in onMutate, reused by any retry) so a
        // network retry can't double-send.
        onMutate: (vars) => {
            if (!vars.idempotencyKey) vars.idempotencyKey = newClientMutationId();
        },
        mutationFn: async ({ submissionId, email, whatsapp, idempotencyKey }) =>
            (
                await api.post(
                    `/digital-forms/submissions/${submissionId}/send`,
                    { email, whatsapp },
                    { headers: idempotencyHeaders(idempotencyKey) }
                )
            ).data.data as SendCertificateResult,
        onSuccess: (result) => {
            const to = [result.sentTo?.email, result.sentTo?.phone].filter(Boolean).join(" and ");
            toast({ title: "Certificate sent", description: to ? `Sent to ${to}` : undefined });
            void qc.invalidateQueries({ queryKey: ["form-submissions"] });
            void qc.invalidateQueries({ queryKey: ["job-certificates"] });
        },
        onError: (err: any) =>
            toast({
                title: "Certificate not sent",
                description: err?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            }),
    });
}
