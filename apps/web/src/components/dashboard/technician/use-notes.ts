"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";

/** Internal note drafting + offline-queued save. */
export function useJobNotes() {
    const [noteDraft, setNoteDraft] = useState("");

    const noteMutation = useMutation<unknown, any, { jobId: string; message: string }>({
        mutationKey: OFFLINE_KEYS.note,
        onError: () => {
            toast({
                title: "Note not saved",
                description: "Your note could not be added.",
                variant: "destructive",
            });
        },
    });

    const saveNote = (jobId: string) => {
        const message = noteDraft.trim();
        if (!message) return;
        noteMutation.mutate({ jobId, message });
        setNoteDraft("");
    };

    const reset = () => setNoteDraft("");

    return { noteDraft, setNoteDraft, saveNote, reset };
}
