"use client";

import type { Dispatch, SetStateAction } from "react";
import { format } from "date-fns";
import { Camera, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { TechnicianJob } from "./types";

interface PhotosCardProps {
    job: TechnicianJob;
    photoFile: File | null;
    setPhotoFile: Dispatch<SetStateAction<File | null>>;
    photoCaption: string;
    setPhotoCaption: Dispatch<SetStateAction<string>>;
    onUpload: () => void;
}

export function PhotosCard({ job, photoFile, setPhotoFile, photoCaption, setPhotoCaption, onUpload }: PhotosCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Job photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr,220px,auto] md:items-end">
                    <div className="space-y-2">
                        <label htmlFor="technician-photo-upload" className="text-sm font-medium">
                            Upload photo
                        </label>
                        <Input
                            id="technician-photo-upload"
                            type="file"
                            accept="image/*"
                            onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="photo-caption" className="text-sm font-medium">
                            Caption
                        </label>
                        <Input
                            id="photo-caption"
                            value={photoCaption}
                            onChange={(event) => setPhotoCaption(event.target.value)}
                            placeholder="Before, after, damage, completed work..."
                        />
                    </div>
                    <Button onClick={onUpload} disabled={!photoFile}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload
                    </Button>
                </div>

                {job.photos.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                        No photos uploaded yet for this job.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {job.photos.map((photo) => (
                            <div key={photo.id} className="overflow-hidden rounded-xl border">
                                <img
                                    src={photo.thumbnailUrl || photo.url}
                                    alt={photo.caption || "Job photo"}
                                    className="h-48 w-full object-cover"
                                />
                                <div className="space-y-2 p-4">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Camera className="h-3.5 w-3.5" />
                                        {format(new Date(photo.createdAt), "MMM d, p")}
                                    </div>
                                    {photo.caption && (
                                        <p className="text-sm text-slate-700">{photo.caption}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
