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
}

export function MediaTab({ job, notes, photos, onSaveNote }: MediaTabProps) {
    return (
        <>
            <PhotosCard job={job} photos={photos} />

            <NotesCard
                job={job}
                noteDraft={notes.noteDraft}
                setNoteDraft={notes.setNoteDraft}
                onSaveNote={onSaveNote}
            />
        </>
    );
}
