"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { Camera, ImagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import type { useJobPhotos } from "./use-photos";
import type { TechnicianJob } from "./types";

interface PhotosCardProps {
    job: TechnicianJob;
    photos: ReturnType<typeof useJobPhotos>;
}

/** Camera-first photo capture. Two big buttons — take a photo (rear camera) or
 *  pull from the gallery (multi-select). Files auto-queue to the offline upload
 *  queue the instant they're picked; the caption is optional and never blocks. */
export function PhotosCard({ job, photos }: PhotosCardProps) {
    const cameraRef = useRef<HTMLInputElement | null>(null);
    const galleryRef = useRef<HTMLInputElement | null>(null);
    const { photoCaption, setPhotoCaption, queuePhotoUpload } = photos;

    const queueFiles = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        const caption = photoCaption;
        Array.from(fileList).forEach((file) => {
            // Fire-and-forget: bytes persist to IndexedDB and the upload is queued
            // so it survives reconnect/reload even with no signal.
            void queuePhotoUpload(job.id, file, caption);
        });
        setPhotoCaption("");
        if (cameraRef.current) cameraRef.current.value = "";
        if (galleryRef.current) galleryRef.current.value = "";
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Job photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <label htmlFor="photo-caption" className="text-xs font-medium text-muted-foreground">
                            Caption for next photos (optional)
                        </label>
                        <Input
                            id="photo-caption"
                            className="h-11"
                            value={photoCaption}
                            onChange={(event) => setPhotoCaption(event.target.value)}
                            placeholder="Before, after, damage, completed work…"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => cameraRef.current?.click()}
                            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-900 text-white active:scale-[0.98] transition"
                        >
                            <Camera className="h-6 w-6" />
                            <span className="text-sm font-semibold">Take photo</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => galleryRef.current?.click()}
                            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-300 bg-background active:scale-[0.98] transition"
                        >
                            <ImagePlus className="h-6 w-6" />
                            <span className="text-sm font-semibold">Add from gallery</span>
                        </button>
                    </div>

                    <input
                        ref={cameraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => queueFiles(event.target.files)}
                    />
                    <input
                        ref={galleryRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => queueFiles(event.target.files)}
                    />
                </div>

                {job.photos.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No photos yet. Tap “Take photo” to capture the job.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {job.photos.map((photo) => (
                            <a
                                key={photo.id}
                                href={photo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-100"
                                title={photo.caption || format(new Date(photo.createdAt), "MMM d, p")}
                            >
                                <img
                                    src={photo.thumbnailUrl || photo.url}
                                    alt={photo.caption || "Job photo"}
                                    className="h-full w-full object-cover"
                                />
                                {photo.caption && (
                                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                                        {photo.caption}
                                    </span>
                                )}
                            </a>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
