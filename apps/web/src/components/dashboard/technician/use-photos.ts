"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../../lib/api";
import { OFFLINE_KEYS, idempotencyHeaders } from "../../../lib/offline-mutations";
import {
    putPhotoBlob,
    delPhotoBlob,
    listQueuedPhotos,
    type QueuedPhoto,
} from "../../../lib/offline-db";
import { resizeImageForUpload } from "../../../lib/image-resize";
import { toast } from "../../ui/use-toast";

/** A photo whose bytes are in IndexedDB but not yet uploaded — rendered in the
 *  grid with a "waiting to upload" badge so the tech sees it took. */
export interface QueuedUpload {
    id: string;
    jobId: string;
    caption: string;
    createdAt: number;
    objectUrl: string;
}

const ASSIGNED_JOBS_KEY = ["technician-assigned-jobs"];

/** Job-photo capture: bytes go to IndexedDB, upload is offline-queued. */
export function useJobPhotos() {
    const queryClient = useQueryClient();
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoCaption, setPhotoCaption] = useState("");
    const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);

    // Object URLs we created, so we can revoke them on refresh/unmount.
    const urlsRef = useRef<string[]>([]);
    // Guards against two sweeps (boot + 'online') running the queue at once.
    const sweepingRef = useRef(false);

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

    /** Rebuild the queued-upload list from IndexedDB, refreshing object URLs. */
    const loadQueued = useCallback(async () => {
        const queued = await listQueuedPhotos();
        urlsRef.current.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                /* already revoked */
            }
        });
        const next = queued.map(({ id, photo }) => ({
            id,
            jobId: photo.jobId,
            caption: photo.caption ?? "",
            createdAt: photo.createdAt,
            objectUrl: URL.createObjectURL(photo.blob),
        }));
        urlsRef.current = next.map((u) => u.objectUrl);
        setQueuedUploads(next);
    }, []);

    /** Upload one queued photo. Idempotency-Key (the stable blob id) lets the
     *  server dedupe if react-query's paused-mutation replay also fires it. */
    const uploadQueued = useCallback(async (id: string, photo: QueuedPhoto) => {
        const formData = new FormData();
        formData.append("photo", photo.blob, photo.fileName);
        if (photo.caption?.trim()) formData.append("caption", photo.caption.trim());
        await api.post(`/media/jobs/${photo.jobId}/photos`, formData, {
            // Phone uploads over patchy cellular can exceed the default 20s.
            timeout: 120000,
            headers: idempotencyHeaders(id),
        });
        await delPhotoBlob(id);
    }, []);

    /** Re-upload every queued photo sequentially. Runs on app start and on
     *  reconnect — without this, a photo whose mutation was dropped (crash, lost
     *  replay) would sit in IndexedDB forever and never retry. */
    const sweepQueued = useCallback(async () => {
        if (sweepingRef.current) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        sweepingRef.current = true;
        let uploaded = 0;
        try {
            const queued = await listQueuedPhotos();
            for (const { id, photo } of queued) {
                if (typeof navigator !== "undefined" && navigator.onLine === false) break;
                try {
                    await uploadQueued(id, photo);
                    uploaded += 1;
                } catch {
                    // Leave it in the queue; the next boot/reconnect retries it.
                }
            }
        } finally {
            sweepingRef.current = false;
            if (uploaded > 0) {
                await loadQueued();
                void queryClient.invalidateQueries({ queryKey: ASSIGNED_JOBS_KEY });
            }
        }
    }, [uploadQueued, loadQueued, queryClient]);

    // On mount: show what's queued and try to flush it. Re-sweep on reconnect.
    useEffect(() => {
        void loadQueued();
        void sweepQueued();
        const onOnline = () => void sweepQueued();
        window.addEventListener("online", onOnline);
        return () => {
            window.removeEventListener("online", onOnline);
            urlsRef.current.forEach((url) => {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    /* already revoked */
                }
            });
        };
    }, [loadQueued, sweepQueued]);

    /** Resize on-device, persist the bytes to IndexedDB, then queue the upload so
     *  it survives reconnect and reload even with no signal. */
    const queuePhotoUpload = async (jobId: string, file: File, caption: string) => {
        const blobId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // 3–8MB camera shots → ~300–500KB before they ever touch the network.
        const resized = await resizeImageForUpload(file);
        await putPhotoBlob(blobId, {
            jobId,
            caption,
            blob: resized,
            fileName: resized.name || `${blobId}.jpg`,
            createdAt: Date.now(),
        });
        photoMutation.mutate({ jobId, blobId, caption });
        setPhotoFile(null);
        setPhotoCaption("");
        const fileInput = document.getElementById("technician-photo-upload") as HTMLInputElement | null;
        if (fileInput) fileInput.value = "";
        void loadQueued();
    };

    const reset = () => {
        setPhotoCaption("");
        setPhotoFile(null);
    };

    return {
        photoFile,
        setPhotoFile,
        photoCaption,
        setPhotoCaption,
        queuePhotoUpload,
        queuedUploads,
        reset,
    };
}
