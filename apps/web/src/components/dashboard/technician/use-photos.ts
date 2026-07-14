"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { putPhotoBlob } from "../../../lib/offline-db";
import { toast } from "../../ui/use-toast";

/** Job-photo capture: bytes go to IndexedDB, upload is offline-queued. */
export function useJobPhotos() {
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoCaption, setPhotoCaption] = useState("");

    const photoMutation = useMutation<unknown, any, { jobId: string; blobId: string; caption: string }>({
        mutationKey: OFFLINE_KEYS.photo,
        onError: (error: any) => {
            toast({
                title: "Photo upload failed",
                description: error?.response?.data?.message ?? "Please try a different image.",
                variant: "destructive",
            });
        },
    });

    /** Persist the photo bytes to IndexedDB, then queue the upload so it
     *  survives reconnect and reload even with no signal. */
    const queuePhotoUpload = async (jobId: string, file: File, caption: string) => {
        const blobId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await putPhotoBlob(blobId, {
            jobId,
            caption,
            blob: file,
            fileName: file.name || `${blobId}.jpg`,
            createdAt: Date.now(),
        });
        photoMutation.mutate({ jobId, blobId, caption });
        setPhotoFile(null);
        setPhotoCaption("");
        const fileInput = document.getElementById("technician-photo-upload") as HTMLInputElement | null;
        if (fileInput) fileInput.value = "";
    };

    const reset = () => {
        setPhotoCaption("");
        setPhotoFile(null);
    };

    return { photoFile, setPhotoFile, photoCaption, setPhotoCaption, queuePhotoUpload, reset };
}
