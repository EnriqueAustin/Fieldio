"use client";

import { NotesCard } from "./notes-card";
import { PhotosCard } from "./photos-card";
import type { useJobNotes } from "./use-notes";
import type { useJobPhotos } from "./use-photos";
import type { TechnicianJob } from "./types";

interface MediaTabProps {
    job: TechnicianJob;
    notes: ReturnType<typeof useJobNotes>;
    photos: ReturnType<typeof useJobPhotos>;
    onSaveNote: () => void;
    onUploadPhoto: () => void;
}

export function MediaTab({ job, notes, photos, onSaveNote, onUploadPhoto }: MediaTabProps) {
    return (
        <>
            <NotesCard
                job={job}
                noteDraft={notes.noteDraft}
                setNoteDraft={notes.setNoteDraft}
                onSaveNote={onSaveNote}
            />

            <PhotosCard
                job={job}
                photoFile={photos.photoFile}
                setPhotoFile={photos.setPhotoFile}
                photoCaption={photos.photoCaption}
                setPhotoCaption={photos.setPhotoCaption}
                onUpload={onUploadPhoto}
            />
        </>
    );
}
