"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";

/** Customer signature capture + offline-queued save. */
export function useSignature() {
    const [signerName, setSignerName] = useState("");
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

    const signatureMutation = useMutation<unknown, any, { jobId: string; signerName: string; signatureDataUrl: string }>({
        mutationKey: OFFLINE_KEYS.signature,
        onError: () => {
            toast({
                title: "Signature not captured",
                description: "Please try signing again.",
                variant: "destructive",
            });
        },
    });

    const saveSignature = (jobId: string) => {
        if (!signatureDataUrl || !signerName.trim()) return;
        signatureMutation.mutate({
            jobId,
            signerName: signerName.trim(),
            signatureDataUrl,
        });
        setSignerName("");
        setSignatureDataUrl(null);
    };

    const reset = () => {
        setSignerName("");
        setSignatureDataUrl(null);
    };

    return { signerName, setSignerName, signatureDataUrl, setSignatureDataUrl, signatureMutation, saveSignature, reset };
}
